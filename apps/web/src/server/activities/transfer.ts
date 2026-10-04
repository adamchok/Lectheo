import {
  answerOnlyLeakInput,
  checkLeak,
  gradedCriteria,
  judgeTransferTask,
  runTask,
} from '@lectheo/ai'
import {
  RubricSecret,
  RubricSnapshot,
  TransferAnswerKey,
  TransferPublicPayload,
} from '@lectheo/contracts'
import { eq, itemSecrets } from '@lectheo/db'
import { rubricOutcome } from '@lectheo/domain'
import { requireUnseenItem } from './items'
import { itemSources } from './sources'
import type { ActivityContext, ActivityTypeHandler, ItemRow } from './types'

/*
 * Transfer problem (F4b, Architecture §5.3–5.4). A new problem applying the concept, graded by the
 * judge against the item's fixed rubric frozen in rubric_snapshot (🔒 ADR-009: the model solution
 * and rubric labels/descriptions stay server-side until the final reveal).
 */

/** Used when the judge's question is missing or would leak the answer (F5.1, F5.3). */
export const FALLBACK_QUESTION =
  'Walk through your answer on one concrete example, step by step. Where does it stop matching ' +
  'what the problem asks for?'

const itemOf = (ctx: ActivityContext): ItemRow => {
  if (!ctx.item) throw new Error('transfer activity without an item')
  return ctx.item
}
const promptOf = (ctx: ActivityContext): string =>
  TransferPublicPayload.parse(itemOf(ctx).publicPayload).prompt
const answerKeyOf = async (ctx: ActivityContext): Promise<TransferAnswerKey> =>
  TransferAnswerKey.parse((await ctx.secrets()).answerKey)

function frozenRubric(ctx: ActivityContext): RubricSecret {
  const snapshot = RubricSnapshot.parse(ctx.activity.rubricSnapshot)
  if (snapshot.kind !== 'item') throw new Error('transfer without an item rubric snapshot')
  return snapshot.rubric
}

/** Word-run length that counts as quoting the model solution. */
export const QUOTE_WORDS = 5

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[("'`]+|[.,;:!?)"'`]+$/g, ''))
    .filter(Boolean)

const shingles = (text: string): Set<string> => {
  const w = words(text)
  return new Set(
    w
      .slice(0, Math.max(0, w.length - QUOTE_WORDS + 1))
      .map((_, i) => w.slice(i, i + QUOTE_WORDS).join(' ')),
  )
}

/**
 * Deterministic first pass: the question repeats a QUOTE_WORDS-word run of the model solution that
 * the problem itself doesn't contain. Catches verbatim leaks with no model call (and in fake mode).
 */
export function quotesAnswer(question: string, modelSolution: string, prompt: string): boolean {
  const own = shingles(prompt)
  const asked = shingles(question)
  return [...shingles(modelSolution)].some((s) => !own.has(s) && asked.has(s))
}

function log(event: string, fields: Record<string, unknown>): void {
  // Same one-line JSON shape as server/http.ts so Vercel indexes it.
  console.log(JSON.stringify({ event, ...fields }))
}

/**
 * The judge saw the model solution and rubric, so its question may give the answer away (F5.3,
 * ADR-009). Verbatim check → leak keywords → checkLeak (Jev on the answer only, Luna in the gray
 * zone, fail closed). Anything blocked becomes FALLBACK_QUESTION.
 */
async function safeQuestion(
  ctx: ActivityContext,
  question: string,
  key: TransferAnswerKey,
  rubric: RubricSecret,
  leakKeywords: readonly string[],
): Promise<string> {
  if (!question.trim()) return FALLBACK_QUESTION
  const prompt = promptOf(ctx)
  const fields = { activityId: ctx.activity.id, itemId: itemOf(ctx).id }
  if (quotesAnswer(question, key.modelSolution, prompt)) {
    log('transfer_question_leak', { ...fields, reason: 'quotes the model solution' })
    return FALLBACK_QUESTION
  }
  const input = answerOnlyLeakInput({
    prompt,
    modelSolution: key.modelSolution,
    rubricDescriptions: rubric.criteria.map((c) => c.description),
    reply: question,
    leakKeywords,
  })
  const check = await checkLeak(input, ctx.ai)
  if (check.decision === 'pass') return question
  log('transfer_question_leak', { ...fields, reason: check.reason, jevP: check.guard.jev?.maxP })
  return FALLBACK_QUESTION
}

/** Model solution, then why it works: what "Show me" and the final reveal explain. */
const explanationOf = (key: TransferAnswerKey): string =>
  `${key.modelSolution}\n\n${key.explanation}`

export const transferHandler: ActivityTypeHandler<'transfer'> = {
  type: 'transfer',
  turnBudget: 0,
  hintsAvailable: 0,

  async start(ctx) {
    const picked = await requireUnseenItem(ctx.db, ctx.actor.userId, ctx.concept.id, 'transfer')
    const [secrets] = await ctx.db
      .select({ rubric: itemSecrets.rubric })
      .from(itemSecrets)
      .where(eq(itemSecrets.itemId, picked.id))
      .limit(1)
    // A transfer item is only gradable against its own rubric (§5.4); no fallback rubric.
    if (!secrets) throw new Error(`item_secrets missing for transfer item ${picked.id}`)
    const rubric = RubricSecret.parse(secrets.rubric)
    return { itemId: picked.id, rubricSnapshot: { kind: 'item', rubric }, persona: null }
  },

  async publicStart(ctx) {
    return { prompt: promptOf(ctx) }
  },

  async submit(ctx, body) {
    const [key, secrets] = await Promise.all([answerKeyOf(ctx), ctx.secrets()])
    const rubric = frozenRubric(ctx)
    const judge = await runTask(
      judgeTransferTask,
      {
        prompt: promptOf(ctx),
        modelSolution: key.modelSolution,
        rubric,
        studentAnswer: body.answer,
      },
      ctx.ai,
    )
    // Labels stay generic: rubric labels describe the answer, revealed only by finalReveal (F5.3).
    const criteria = gradedCriteria(judge.output, rubric.criteria).map((c, i) => ({
      ...c,
      label: `Criterion ${i + 1}`,
    }))
    const question = await safeQuestion(
      ctx,
      judge.output.guidingQuestion ?? '',
      key,
      rubric,
      secrets.leakKeywords,
    )
    return {
      checks: null,
      criteria,
      // Same 80 % / 50 % bands as teach-back (F4b.2 ≡ F4a.3, domain rubricOutcome).
      ...rubricOutcome(criteria),
      feedback: { guidingQuestion: question, hint: null },
      rationale: judge.output.rationale,
      misconceptions: judge.output.misconceptions,
      judgeModel: judge.model,
      sources: await itemSources(ctx.db, itemOf(ctx)),
    }
  },

  async explanation(ctx) {
    return {
      explanation: explanationOf(await answerKeyOf(ctx)),
      sources: await itemSources(ctx.db, itemOf(ctx)),
    }
  },

  async finalReveal(ctx) {
    return {
      explanation: explanationOf(await answerKeyOf(ctx)),
      rubric: frozenRubric(ctx).criteria.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
    }
  },
}
