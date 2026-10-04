import {
  authorReplyTask,
  CANNED_DEFLECTION,
  checkLeak,
  gradedCriteria,
  judgeCorrectionTask,
  keywordHit,
  runTask,
  type ChatTurn,
  type LeakCheckResult,
} from '@lectheo/ai'
import {
  HintsSecret,
  RubricSecret,
  RubricSnapshot,
  SpotFlawAnswerKey,
  SpotFlawPublicPayload,
  type MessageGuard,
} from '@lectheo/contracts'
import { itemSecrets, eq, messages } from '@lectheo/db'
import {
  checkSpotFlaw,
  scoreSpotFlaw,
  SPOT_FLAW_CORRECTION_MAX,
  type SpotFlawChecks,
} from '@lectheo/domain'
import { requireUnseenItem } from './items'
import { itemSources } from './sources'
import type { ActivityContext, ActivityTypeHandler, Criterion, ItemRow } from './types'

/*
 * Spot the flaw (F4c, Architecture §4.5).
 * ADR-009: the author never sees the flaw; verdict + location are checked in code; only the
 * correction goes to the judge, against the rubric frozen in rubric_snapshot.
 */

export const SPOT_FLAW_TURN_BUDGET = 6
export const SPOT_FLAW_HINTS = 2

type AnswerKey = SpotFlawAnswerKey

/**
 * Rubric for a bank item stored without one. Built from the answer key so the judge still grades
 * against a factual criterion; the bank should always carry its own (logged when it doesn't).
 */
export function fallbackRubric(key: AnswerKey): RubricSecret {
  const description = key.correction
    ? `States, in any wording: ${key.correction}`
    : 'States what the flawed sentence should say instead.'
  return {
    criteria: [
      {
        id: 'correction',
        label: 'Correction fixes the flawed claim',
        description,
        max: SPOT_FLAW_CORRECTION_MAX,
      },
    ],
  }
}

/**
 * Socratic questions used when the judge's question doesn't apply (F5.1, F5.3). None may point at
 * a sentence or hint at this scenario's verdict.
 */
export const GUIDING_QUESTIONS = {
  /** Said "correct" on a flawed scenario. */
  missedFlaw:
    'Pick the boldest claim in the explanation. Can you think of one concrete input or case ' +
    'where it would not hold?',
  /** Said "flawed" on a correct scenario. */
  falseAlarm:
    'For the sentence you flagged, can you build a concrete example where it actually fails? ' +
    'If you cannot, what does that tell you?',
  /** Right verdict, wrong sentence. */
  location:
    'Test each sentence on its own: which one makes a promise that has to be true every time, ' +
    'not just usually?',
  /** Right sentence, no correction written. */
  noCorrection: 'You found the sentence. What should it say instead, and why?',
} as const

/** Generic ladder for items without their own hints (general, then specific). */
const FALLBACK_HINTS: readonly [string, string] = [
  'Read each sentence as a promise: does it hold for every input, or only for the examples ' +
    'you have in mind?',
  'Look hardest at words like "always", "never", "only" and at any number or complexity claim.',
]

const item = (ctx: ActivityContext): ItemRow => {
  if (!ctx.item) throw new Error('spot_flaw activity without an item')
  return ctx.item
}
const sentencesOf = (ctx: ActivityContext): string[] =>
  SpotFlawPublicPayload.parse(item(ctx).publicPayload).sentences
const answerKeyOf = async (ctx: ActivityContext): Promise<AnswerKey> =>
  SpotFlawAnswerKey.parse((await ctx.secrets()).answerKey)

function frozenRubric(ctx: ActivityContext, key: AnswerKey): RubricSecret {
  const snapshot = RubricSnapshot.parse(ctx.activity.rubricSnapshot)
  return snapshot.kind === 'item' ? snapshot.rubric : fallbackRubric(key)
}

function log(event: string, fields: Record<string, unknown>): void {
  // Same one-line JSON shape as server/http.ts so Vercel indexes it.
  console.log(JSON.stringify({ event, ...fields }))
}

const CLEAN_GUARD: MessageGuard = {
  regexHit: false,
  jev: null,
  escalated: false,
  escalationVerdict: null,
  regenerated: false,
}

/**
 * Leak keywords the scenario itself already shows can't leak anything, and blocking on them
 * deflects ordinary replies (seen with the real author: "balanced" in a BST scenario).
 */
export function effectiveLeakKeywords(
  keywords: readonly string[],
  sentences: readonly string[],
): string[] {
  const scenario = sentences.join('\n')
  return keywords.filter((k) => !keywordHit(scenario, [k]))
}

async function guardReply(ctx: ActivityContext, reply: string): Promise<LeakCheckResult> {
  const [key, raw] = await Promise.all([answerKeyOf(ctx), ctx.secrets()])
  const secrets = { leakKeywords: effectiveLeakKeywords(raw.leakKeywords, sentencesOf(ctx)) }
  if (!key.hasFlaw || key.flawSentenceIdx === null) {
    // No-flaw scenario: there is no location or correction to leak, and the author is equally
    // confident in every scenario (it never knows which kind it wrote), so its tone carries no
    // signal. Jev has nothing to score against; bank leak keywords still apply.
    const regexHit = keywordHit(reply, secrets.leakKeywords)
    return {
      decision: regexHit ? 'block' : 'pass',
      guard: { ...CLEAN_GUARD, regexHit },
      reason: 'no-flaw: keywords only',
    }
  }
  return checkLeak(
    {
      scenarioSentences: sentencesOf(ctx),
      flawSentenceIdx: key.flawSentenceIdx,
      flawSummary: key.flawSummary ?? '',
      correction: key.correction ?? '',
      reply,
      leakKeywords: secrets.leakKeywords,
    },
    ctx.ai,
  )
}

async function draftReply(ctx: ActivityContext, text: string, stricter: boolean) {
  const visible = await ctx.visibleMessages()
  // The newest visible message is the student's current one (stored by the core).
  const history: ChatTurn[] = visible.slice(0, -1).map((m) => ({ role: m.role, text: m.content }))
  const input = {
    conceptName: ctx.concept.name,
    scenarioSentences: sentencesOf(ctx),
    history,
    studentMessage: text,
    stricter,
  }
  return (await runTask(authorReplyTask, input, ctx.ai)).output.reply
}

async function storePersona(
  ctx: ActivityContext,
  content: string,
  visible: boolean,
  guard: MessageGuard | null,
): Promise<void> {
  await ctx.db
    .insert(messages)
    .values({ activityId: ctx.activity.id, role: 'persona', content, visible, guard })
}

export type AuthorOutcome = 'pass' | 'regenerated' | 'deflected'

/**
 * Author reply → leak check → one stricter redraft → canned deflection (fail closed).
 * Every draft keeps its guard in messages.guard; the visible canned deflection carries the guard
 * that blocked the redraft, so the deflection rate is
 *   count(visible persona with content = CANNED_DEFLECTION) / count(visible persona).
 */
async function guardedAuthorReply(
  ctx: ActivityContext,
  text: string,
): Promise<{ reply: string; outcome: AuthorOutcome; guard: MessageGuard }> {
  const first = await draftReply(ctx, text, false)
  const check1 = await guardReply(ctx, first)
  if (check1.decision === 'pass') {
    await storePersona(ctx, first, true, check1.guard)
    return { reply: first, outcome: 'pass', guard: check1.guard }
  }
  await storePersona(ctx, first, false, check1.guard)
  const second = await draftReply(ctx, text, true)
  const check2 = await guardReply(ctx, second)
  const guard = { ...check2.guard, regenerated: true }
  if (check2.decision === 'pass') {
    await storePersona(ctx, second, true, guard)
    return { reply: second, outcome: 'regenerated', guard }
  }
  await storePersona(ctx, second, false, guard)
  await storePersona(ctx, CANNED_DEFLECTION, true, guard)
  return { reply: CANNED_DEFLECTION, outcome: 'deflected', guard }
}

const scaleToCorrection = (criteria: readonly Criterion[]): number => {
  const max = criteria.reduce((s, c) => s + c.max, 0)
  const score = criteria.reduce((s, c) => s + Math.min(Math.max(c.score, 0), c.max), 0)
  return max === 0 ? 0 : Math.round((score / max) * SPOT_FLAW_CORRECTION_MAX)
}

/** Which fallback question fits this try (the judge's own question wins when it applies). */
export function fallbackQuestion(key: Pick<AnswerKey, 'hasFlaw'>, checks: SpotFlawChecks): string {
  if (!checks.verdictCorrect) {
    return key.hasFlaw ? GUIDING_QUESTIONS.missedFlaw : GUIDING_QUESTIONS.falseAlarm
  }
  if (checks.locationCorrect === false) return GUIDING_QUESTIONS.location
  return GUIDING_QUESTIONS.noCorrection
}

const zeroCriteria = (rubric: RubricSecret): Criterion[] =>
  rubric.criteria.map((c) => ({ id: c.id, label: c.label, score: 0, max: c.max }))

export const spotFlawHandler: ActivityTypeHandler<'spot_flaw'> = {
  type: 'spot_flaw',
  turnBudget: SPOT_FLAW_TURN_BUDGET,
  hintsAvailable: SPOT_FLAW_HINTS,

  async start(ctx) {
    const picked = await requireUnseenItem(ctx.db, ctx.actor.userId, ctx.concept.id, 'spot_flaw')
    const [secrets] = await ctx.db
      .select({ rubric: itemSecrets.rubric, answerKey: itemSecrets.answerKey })
      .from(itemSecrets)
      .where(eq(itemSecrets.itemId, picked.id))
      .limit(1)
    if (!secrets) throw new Error(`item_secrets missing for spot_flaw item ${picked.id}`)
    const stored = RubricSecret.safeParse(secrets.rubric)
    if (!stored.success) log('spot_flaw_rubric_fallback', { itemId: picked.id })
    const rubric = stored.success
      ? stored.data
      : fallbackRubric(SpotFlawAnswerKey.parse(secrets.answerKey))
    return { itemId: picked.id, rubricSnapshot: { kind: 'item', rubric }, persona: null }
  },

  async publicStart(ctx) {
    return {
      scenario: { sentences: sentencesOf(ctx) },
      turnBudget: ctx.activity.turnBudget,
      hintsAvailable: SPOT_FLAW_HINTS,
    }
  },

  async reply(ctx, { text, turnsLeft }) {
    const started = Date.now()
    const { reply, outcome, guard } = await guardedAuthorReply(ctx, text)
    // ponytail: turn latency is logged, not stored (MessageGuard only has Jev latency); the ~3 s
    // budget is watched in logs. Add a contract field if it needs SQL.
    log('author_reply', {
      activityId: ctx.activity.id,
      outcome,
      latencyMs: Date.now() - started,
      jevP: guard.jev?.maxP ?? null,
      escalated: guard.escalated,
    })
    return { reply, turnsLeft }
  },

  async hint(ctx, n) {
    const parsed = HintsSecret.safeParse((await ctx.secrets()).hints)
    if (!parsed.success) log('spot_flaw_hint_fallback', { itemId: item(ctx).id })
    const ladder = parsed.success ? parsed.data : FALLBACK_HINTS
    return ladder[Math.min(Math.max(n, 1), ladder.length) - 1] ?? FALLBACK_HINTS[0]
  },

  async submit(ctx, body) {
    const key = await answerKeyOf(ctx)
    const checks = checkSpotFlaw(key, body)
    const rubric = frozenRubric(ctx, key)
    const studentCorrection = body.correction?.trim() ?? ''
    // A blank correction scores 0 without a judge call.
    const judge =
      checks.needsJudge && key.flawSentenceIdx !== null && studentCorrection
        ? await runTask(
            judgeCorrectionTask,
            {
              scenarioSentences: sentencesOf(ctx),
              flawSentenceIdx: key.flawSentenceIdx,
              flawSummary: key.flawSummary ?? '',
              correction: key.correction ?? '',
              rubric,
              studentCorrection,
            },
            ctx.ai,
          )
        : null
    const criteria: Criterion[] = !key.hasFlaw
      ? []
      : judge
        ? gradedCriteria(judge.output, rubric.criteria)
        : zeroCriteria(rubric)
    const scored = scoreSpotFlaw(checks, checks.needsJudge ? scaleToCorrection(criteria) : null)
    // The judge's question is about the correction of the real flawed sentence; when the student
    // picked another sentence it would point them at the answer, so the location question wins.
    const judgeQuestion = checks.locationCorrect ? judge?.output.guidingQuestion : undefined
    return {
      checks: { verdict: checks.verdictCorrect, location: checks.locationCorrect },
      criteria,
      ...scored,
      feedback: { guidingQuestion: judgeQuestion || fallbackQuestion(key, checks), hint: null },
      rationale: judge?.output.rationale ?? null,
      misconceptions: judge?.output.misconceptions ?? [],
      judgeModel: judge?.model ?? null,
      sources: await itemSources(ctx.db, item(ctx)),
    }
  },

  async explanation(ctx) {
    const key = await answerKeyOf(ctx)
    return { explanation: key.explanation, sources: await itemSources(ctx.db, item(ctx)) }
  },

  async finalReveal(ctx) {
    const key = await answerKeyOf(ctx)
    const codeChecked = [
      {
        id: 'verdict',
        label: 'Verdict',
        description: 'Says whether the scenario has a flaw (checked exactly).',
      },
      ...(key.hasFlaw
        ? [
            {
              id: 'location',
              label: 'Flawed sentence',
              description: 'Points to the sentence that is wrong (checked exactly).',
            },
          ]
        : []),
    ]
    const judged = key.hasFlaw
      ? frozenRubric(ctx, key).criteria.map(({ id, label, description }) => ({
          id,
          label,
          description,
        }))
      : []
    return { explanation: key.explanation, rubric: [...codeChecked, ...judged] }
  },
}
