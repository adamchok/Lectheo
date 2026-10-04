import { gateway } from '@ai-sdk/gateway'
import { experimental_evaluate } from 'ai'
import type { MessageGuard } from '@lectheo/contracts'
import { isFakeMode } from './call-model'
import { callEntry, type TaskIdentity } from './log'
import { JEV_TIMEOUT_MS, MODEL_SLUGS } from './models'
import { runTask } from './run-task'
import { leakEscalationTask } from './tasks/leak-escalation/task'
import type { LeakEscalationInput, LeakEscalationOutput } from './tasks/leak-escalation/schema'
import type { TaskContext, TaskHooks } from './types'
import { gatewayCost, ZERO_USAGE } from './usage'

/**
 * Author-reply leak check (ADR-013, Architecture §4.5):
 * keyword regex → Jev (2 boolean questions, p = max) → <0.3 pass, >0.7 block, gray → Luna.
 * Jev error/timeout (800 ms) → Luna. Luna failure → block (fail closed → canned deflection).
 */

export const GUARD_PASS_BELOW = 0.3
export const GUARD_BLOCK_ABOVE = 0.7
export { JEV_TIMEOUT_MS }
export const GUARD_PROMPT_VERSION = 'leak-jev@1'

/** Shown instead of a blocked reply after the one stricter regeneration also leaks. */
export const CANNED_DEFLECTION =
  "I'm fairly confident in what I wrote. Which part looks off to you, and why?"

export interface LeakCheckInput extends LeakEscalationInput {
  /** item_secrets.leak_keywords */
  readonly leakKeywords: readonly string[]
}

/** Transfer guiding questions: one prompt, no flawed sentence; only the answer can leak. */
export const answerOnlyLeakInput = (args: {
  prompt: string
  modelSolution: string
  rubricDescriptions: readonly string[]
  reply: string
  leakKeywords: readonly string[]
}): LeakCheckInput => ({
  scenarioSentences: [args.prompt],
  flawSentenceIdx: 0,
  flawSummary: args.rubricDescriptions.join(' '),
  correction: args.modelSolution,
  reply: args.reply,
  leakKeywords: args.leakKeywords,
  answerOnly: true,
})

export type GuardDecision = 'pass' | 'block'

export interface LeakCheckResult {
  readonly decision: GuardDecision
  /** Store in messages.guard. The route sets `regenerated: true` on the second check. */
  readonly guard: MessageGuard
  readonly reason: string
}

export interface JevScores {
  readonly revealsLocation: number
  readonly revealsCorrection: number
}

export interface GuardContext extends Pick<
  TaskContext,
  'userId' | 'lectureId' | 'resolveModel' | 'fake' | 'retryDelayMs'
> {
  readonly hooks: Pick<TaskHooks, 'logCall'>
  /** Test seam: replaces the Jev call. Must honour `signal`. */
  readonly evaluate?: (input: LeakCheckInput, signal: AbortSignal) => Promise<JevScores>
  /** Test seam: replaces the Luna escalation. */
  readonly escalate?: (input: LeakCheckInput) => Promise<LeakEscalationOutput>
  readonly jevTimeoutMs?: number
}

const JEV_IDENTITY: TaskIdentity = {
  name: 'leak-check',
  role: 'guard',
  promptVersion: GUARD_PROMPT_VERSION,
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Case-insensitive whole-term match of any leak keyword (terms may contain symbols). */
export function keywordHit(reply: string, keywords: readonly string[]): boolean {
  const terms = keywords.map((k) => k.trim()).filter((k) => k.length > 0)
  if (terms.length === 0) return false
  const alternation = terms.map(escapeRegExp).join('|')
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alternation})(?![\\p{L}\\p{N}_])`, 'iu').test(reply)
}

const JEV_QUESTIONS = {
  revealsLocation: {
    type: 'boolean',
    instructions:
      'Does `reply` reveal, point to, or hint at which sentence of `scenarioSentences` is ' +
      'flawed (the one at index `flawSentenceIdx`)?',
  },
  revealsCorrection: {
    type: 'boolean',
    instructions:
      'Does `reply` state or imply `correction`, or otherwise explain what is wrong ' +
      '(`flawSummary`)?',
  },
} as const

async function jevEvaluate(
  input: LeakCheckInput,
  signal: AbortSignal,
  ctx: GuardContext,
): Promise<JevScores> {
  const started = Date.now()
  const result = await experimental_evaluate({
    model: gateway.evaluationModel(MODEL_SLUGS.jev),
    state: {
      scenarioSentences: [...input.scenarioSentences],
      flawSentenceIdx: input.flawSentenceIdx,
      flawSummary: input.flawSummary,
      correction: input.correction,
      reply: input.reply,
    },
    questions: JEV_QUESTIONS,
    maxRetries: 0,
    abortSignal: signal,
  })
  const usage = {
    ...ZERO_USAGE,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    costUsd: gatewayCost(result.providerMetadata),
  }
  const entry = { outcome: 'ok' as const, usage, model: MODEL_SLUGS.jev, started }
  await ctx.hooks.logCall(callEntry(JEV_IDENTITY, ctx, entry))
  return {
    revealsLocation: result.answers.revealsLocation.probability,
    revealsCorrection: result.answers.revealsCorrection.probability,
  }
}

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(new Error(`timed out after ${ms} ms`))
    }, ms)
  })
  try {
    return await Promise.race([run(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

/** Jev scores, or null if Jev failed or exceeded the timeout (→ escalate). */
async function tryJev(input: LeakCheckInput, ctx: GuardContext): Promise<MessageGuard['jev']> {
  const started = Date.now()
  const evaluate = ctx.evaluate ?? ((i, signal) => jevEvaluate(i, signal, ctx))
  try {
    const scores = await withTimeout(ctx.jevTimeoutMs ?? JEV_TIMEOUT_MS, (s) => evaluate(input, s))
    // answerOnly: there is no flawed sentence, so the location score is noise (seen at 0.5–0.8
    // on harmless transfer questions); only the correction/answer score decides.
    const maxP = input.answerOnly
      ? scores.revealsCorrection
      : Math.max(scores.revealsLocation, scores.revealsCorrection)
    return {
      ...scores,
      maxP,
      latencyMs: Date.now() - started,
    }
  } catch {
    // ponytail: Jev failures are not logged separately; the escalation row records the fallback.
    return null
  }
}

async function escalate(
  input: LeakCheckInput,
  base: MessageGuard,
  ctx: GuardContext,
): Promise<LeakCheckResult> {
  const run =
    ctx.escalate ??
    (async (i: LeakCheckInput) => (await runTask(leakEscalationTask, i, ctx)).output)
  try {
    const verdict = await run(input)
    const guard = { ...base, escalated: true, escalationVerdict: verdict.leaks }
    return { decision: verdict.leaks ? 'block' : 'pass', guard, reason: verdict.reason }
  } catch {
    const guard = { ...base, escalated: true, escalationVerdict: null }
    return { decision: 'block', guard, reason: 'escalation failed (fail closed)' }
  }
}

export async function checkLeak(
  input: LeakCheckInput,
  ctx: GuardContext,
): Promise<LeakCheckResult> {
  const regexHit = keywordHit(input.reply, input.leakKeywords)
  const base: MessageGuard = {
    regexHit,
    jev: null,
    escalated: false,
    escalationVerdict: null,
    regenerated: false,
  }
  if (regexHit) return { decision: 'block', guard: base, reason: 'leak keyword in reply' }
  if (isFakeMode(ctx)) return { decision: 'pass', guard: base, reason: 'fake mode: keywords only' }

  const jev = await tryJev(input, ctx)
  const guard = { ...base, jev }
  if (jev && jev.maxP < GUARD_PASS_BELOW) {
    return { decision: 'pass', guard, reason: `jev p=${jev.maxP.toFixed(2)}` }
  }
  if (jev && jev.maxP > GUARD_BLOCK_ABOVE) {
    return { decision: 'block', guard, reason: `jev p=${jev.maxP.toFixed(2)}` }
  }
  return escalate(input, guard, ctx)
}
