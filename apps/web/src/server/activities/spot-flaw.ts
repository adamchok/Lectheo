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
import { checkSpotFlaw, scoreSpotFlaw, SPOT_FLAW_CORRECTION_MAX } from '@lectheo/domain'
import { requireUnseenItem } from './items'
import { itemSources } from './sources'
import type { ActivityContext, ActivityTypeHandler, Criterion, ItemRow } from './types'

/*
 * Spot the flaw (F4c, Architecture §4.5) — minimal end-to-end handler.
 * ADR-009: the author never sees the flaw; verdict + location are checked in code; only the
 * correction goes to the judge, against the rubric frozen in rubric_snapshot.
 */

export const SPOT_FLAW_TURN_BUDGET = 6
export const SPOT_FLAW_HINTS = 2

/** Used when an item has no stored rubric. TODO(feature-spot-the-flaw): require one in the bank. */
const DEFAULT_RUBRIC: RubricSecret = {
  criteria: [
    {
      id: 'correction',
      label: 'Correction is right and complete',
      description: 'States what the flawed sentence should say and why.',
      max: SPOT_FLAW_CORRECTION_MAX,
    },
  ],
}

// TODO(feature-spot-the-flaw): Socratic copy review; these are used only when no judge ran.
const FALLBACK_QUESTIONS = {
  verdict:
    'Read each sentence again: does every claim hold for every input, or only for the ' +
    'examples you have in mind?',
  location: 'Which sentence makes a claim that the others depend on? Test that one first.',
} as const

const item = (ctx: ActivityContext): ItemRow => {
  if (!ctx.item) throw new Error('spot_flaw activity without an item')
  return ctx.item
}
const sentencesOf = (ctx: ActivityContext): string[] =>
  SpotFlawPublicPayload.parse(item(ctx).publicPayload).sentences
const answerKeyOf = async (ctx: ActivityContext) =>
  SpotFlawAnswerKey.parse((await ctx.secrets()).answerKey)

function frozenRubric(ctx: ActivityContext): RubricSecret {
  const snapshot = RubricSnapshot.parse(ctx.activity.rubricSnapshot)
  return snapshot.kind === 'item' ? snapshot.rubric : DEFAULT_RUBRIC
}

async function guardReply(ctx: ActivityContext, reply: string): Promise<LeakCheckResult> {
  const [key, secrets] = await Promise.all([answerKeyOf(ctx), ctx.secrets()])
  if (!key.hasFlaw || key.flawSentenceIdx === null) {
    // No flaw to leak; keywords still catch "it's all correct"-style giveaways.
    // TODO(feature-spot-the-flaw): decide how the guard treats no-flaw scenarios.
    const regexHit = keywordHit(reply, secrets.leakKeywords)
    const guard: MessageGuard = {
      regexHit,
      jev: null,
      escalated: false,
      escalationVerdict: null,
      regenerated: false,
    }
    return { decision: regexHit ? 'block' : 'pass', guard, reason: 'no-flaw: keywords only' }
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

/** Author reply → leak check → one stricter redraft → canned deflection (fail closed). */
async function guardedAuthorReply(ctx: ActivityContext, text: string): Promise<string> {
  const first = await draftReply(ctx, text, false)
  const check1 = await guardReply(ctx, first)
  if (check1.decision === 'pass') {
    await storePersona(ctx, first, true, check1.guard)
    return first
  }
  await storePersona(ctx, first, false, check1.guard)
  const second = await draftReply(ctx, text, true)
  const check2 = await guardReply(ctx, second)
  const guard = { ...check2.guard, regenerated: true }
  if (check2.decision === 'pass') {
    await storePersona(ctx, second, true, guard)
    return second
  }
  await storePersona(ctx, second, false, guard)
  await storePersona(ctx, CANNED_DEFLECTION, true, null)
  return CANNED_DEFLECTION
}

const scaleToCorrection = (criteria: readonly Criterion[]): number => {
  const max = criteria.reduce((s, c) => s + c.max, 0)
  const score = criteria.reduce((s, c) => s + Math.min(Math.max(c.score, 0), c.max), 0)
  return max === 0 ? 0 : Math.round((score / max) * SPOT_FLAW_CORRECTION_MAX)
}

export const spotFlawHandler: ActivityTypeHandler<'spot_flaw'> = {
  type: 'spot_flaw',
  turnBudget: SPOT_FLAW_TURN_BUDGET,
  hintsAvailable: SPOT_FLAW_HINTS,

  async start(ctx) {
    const picked = await requireUnseenItem(ctx.db, ctx.actor.userId, ctx.concept.id, 'spot_flaw')
    const [secrets] = await ctx.db
      .select({ rubric: itemSecrets.rubric })
      .from(itemSecrets)
      .where(eq(itemSecrets.itemId, picked.id))
      .limit(1)
    const rubric = secrets?.rubric ? RubricSecret.parse(secrets.rubric) : DEFAULT_RUBRIC
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
    // TODO(feature-spot-the-flaw): latency budget (~3 s) and deflection-rate logging.
    return { reply: await guardedAuthorReply(ctx, text), turnsLeft }
  },

  async hint(ctx, n) {
    const parsed = HintsSecret.safeParse((await ctx.secrets()).hints)
    // TODO(feature-spot-the-flaw): every bank item should carry its 2-step ladder.
    const fallback = n === 1 ? FALLBACK_QUESTIONS.verdict : FALLBACK_QUESTIONS.location
    return parsed.success ? (parsed.data[n - 1] ?? fallback) : fallback
  },

  async submit(ctx, body) {
    const key = await answerKeyOf(ctx)
    const checks = checkSpotFlaw(key, body)
    const rubric = frozenRubric(ctx)
    const judge =
      checks.needsJudge && key.flawSentenceIdx !== null
        ? await runTask(
            judgeCorrectionTask,
            {
              scenarioSentences: sentencesOf(ctx),
              flawSentenceIdx: key.flawSentenceIdx,
              flawSummary: key.flawSummary ?? '',
              correction: key.correction ?? '',
              rubric,
              studentCorrection: body.correction ?? '',
            },
            ctx.ai,
          )
        : null
    const criteria: Criterion[] = !key.hasFlaw
      ? []
      : judge
        ? gradedCriteria(judge.output, rubric.criteria)
        : rubric.criteria.map((c) => ({ id: c.id, label: c.label, score: 0, max: c.max }))
    const scored = scoreSpotFlaw(checks, judge ? scaleToCorrection(criteria) : null)
    const fallbackQuestion = checks.verdictCorrect
      ? FALLBACK_QUESTIONS.location
      : FALLBACK_QUESTIONS.verdict
    return {
      checks: { verdict: checks.verdictCorrect, location: checks.locationCorrect },
      criteria,
      ...scored,
      feedback: { guidingQuestion: judge?.output.guidingQuestion ?? fallbackQuestion, hint: null },
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
      ? frozenRubric(ctx).criteria.map(({ id, label, description }) => ({ id, label, description }))
      : []
    return { explanation: key.explanation, rubric: [...codeChecked, ...judged] }
  },
}
