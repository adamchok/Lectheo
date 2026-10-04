import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type ModelMessage,
  type TextPart,
} from 'ai'
import type { z } from 'zod'
import { attemptPlan, isFakeMode, resolveModel, withFallback } from './call-model'
import { AiPausedError, errorMessage, FatalTaskError } from './errors'
import type { ReasoningEffort, Role } from './models'
import { callEntry, runGates, type Logger } from './log'
import type { LlmOutcome, TaskContext } from './types'
import { addUsage, usageFrom, ZERO_USAGE, type UsageTotals } from './usage'

export interface PromptSpec {
  readonly system: string
  /** Either a single user prompt… */
  readonly prompt?: string
  /** …or a message list (multi-turn). */
  readonly messages?: readonly ModelMessage[]
  /** Stable, cacheable prefix blocks (e.g. `lectureContext(segments)`), sent first. */
  readonly cacheKeyBlocks?: readonly TextPart[]
}

export interface TaskDef<I, O> {
  readonly name: string
  readonly role: Role
  readonly promptVersion: string
  /** Use `.nullable()`, never `.optional()` (strict JSON schema). Counts are checked in validate. */
  readonly schema: z.ZodType<O>
  readonly buildPrompt: (input: I) => PromptSpec
  /** Semantic checks (citations exist, counts, unique options…). Return [] when valid. */
  readonly validate?: (output: O, input: I) => readonly string[]
  /** Includes reasoning tokens — see MAX_OUTPUT_TOKENS. */
  readonly maxOutputTokens: number
  /** Overrides the role's primary effort (e.g. 'low' for on-demand reasoner calls). */
  readonly reasoning?: ReasoningEffort
  /** Deterministic, schema-valid output used when AI_FAKE=1. */
  readonly fake: (input: I) => O
}

export function defineTask<I, O>(def: TaskDef<I, O>): TaskDef<I, O> {
  return Object.freeze({ ...def })
}

export interface TaskResult<O> {
  readonly output: O
  /** Slug that produced the output (record as attempts.judge_model for judge tasks). */
  readonly model: string
  readonly outcome: Extract<LlmOutcome, 'ok' | 'repaired'>
  readonly usage: UsageTotals
  readonly latencyMs: number
}

export const FAKE_MODEL = 'fake'

interface Generation<O> {
  readonly output: O | null
  readonly text: string
  readonly errors: readonly string[]
  readonly usage: UsageTotals
  readonly model: string
}

export function buildMessages(spec: PromptSpec): ModelMessage[] {
  const blocks = spec.cacheKeyBlocks ?? []
  if (spec.prompt !== undefined) {
    return [{ role: 'user', content: [...blocks, { type: 'text', text: spec.prompt }] }]
  }
  if (!spec.messages || spec.messages.length === 0) {
    throw new Error('buildPrompt must return `prompt` or a non-empty `messages`')
  }
  const prefix: ModelMessage[] = blocks.length > 0 ? [{ role: 'user', content: [...blocks] }] : []
  return [...prefix, ...spec.messages]
}

function repairMessages(messages: readonly ModelMessage[], failed: Generation<unknown>) {
  const feedback =
    'Your previous output was invalid:\n' +
    failed.errors.map((e) => `- ${e}`).join('\n') +
    '\nReturn the complete corrected JSON object, nothing else.'
  return [
    ...messages,
    { role: 'assistant', content: failed.text || '(no output)' },
    { role: 'user', content: feedback },
  ] satisfies ModelMessage[]
}

async function generateOnce<I, O>(
  task: TaskDef<I, O>,
  input: I,
  system: string,
  messages: ModelMessage[],
  ctx: TaskContext,
): Promise<Generation<O>> {
  const { value, choice } = await withFallback(
    attemptPlan(task.role, task.reasoning),
    ctx,
    async (choice) => {
      try {
        const r = await generateText({
          model: resolveModel(ctx, choice.model),
          instructions: system,
          messages,
          output: Output.object({ schema: task.schema }),
          maxOutputTokens: task.maxOutputTokens,
          reasoning: choice.reasoning,
          maxRetries: 0,
          ...(ctx.abortSignal ? { abortSignal: ctx.abortSignal } : {}),
        })
        const usage = usageFrom(r.totalUsage, r.providerMetadata)
        return { output: r.output as O, text: r.text, usage, schemaError: null }
      } catch (error) {
        if (NoObjectGeneratedError.isInstance(error)) {
          const cause = error.cause ? ` (${errorMessage(error.cause)})` : ''
          const usage = usageFrom(error.usage, undefined)
          return { output: null, text: error.text ?? '', usage, schemaError: error.message + cause }
        }
        if (NoOutputGeneratedError.isInstance(error)) {
          return { output: null, text: '', usage: ZERO_USAGE, schemaError: error.message }
        }
        throw error
      }
    },
  )
  const errors =
    value.output === null
      ? [`output does not match the schema: ${value.schemaError}`]
      : (task.validate?.(value.output, input) ?? [])
  return { output: value.output, text: value.text, errors, usage: value.usage, model: choice.model }
}

async function runLive<I, O>(
  task: TaskDef<I, O>,
  input: I,
  ctx: TaskContext,
  log: Logger,
): Promise<Omit<TaskResult<O>, 'latencyMs'>> {
  const spec = task.buildPrompt(input)
  const messages = buildMessages(spec)
  const spent: Generation<O>[] = []
  const totals = () => spent.reduce((acc, g) => addUsage(acc, g.usage), ZERO_USAGE)
  const lastModel = () => spent.at(-1)?.model ?? attemptPlan(task.role)[0]?.model ?? 'unknown'

  let result: Omit<TaskResult<O>, 'latencyMs'>
  try {
    const first = await generateOnce(task, input, spec.system, messages, ctx)
    spent.push(first)
    const final =
      first.errors.length === 0
        ? first
        : await generateOnce(task, input, spec.system, repairMessages(messages, first), ctx)
    if (final !== first) spent.push(final)
    if (final.errors.length > 0 || final.output === null) {
      throw new FatalTaskError(task.name, final.errors)
    }
    const outcome = final === first ? 'ok' : 'repaired'
    result = { output: final.output, model: final.model, outcome, usage: totals() }
  } catch (error) {
    await log(error instanceof AiPausedError ? 'budget_blocked' : 'failed', totals(), lastModel())
    throw error
  }
  await log(result.outcome, result.usage, result.model)
  return result
}

async function runFake<I, O>(
  task: TaskDef<I, O>,
  input: I,
  log: Logger,
): Promise<Omit<TaskResult<O>, 'latencyMs'>> {
  const usage = { ...ZERO_USAGE, costUsd: 0 }
  const output = task.schema.parse(task.fake(input))
  const errors = task.validate?.(output, input) ?? []
  if (errors.length > 0) {
    await log('failed', usage, FAKE_MODEL)
    throw new FatalTaskError(task.name, errors)
  }
  await log('ok', usage, FAKE_MODEL)
  return { output, model: FAKE_MODEL, outcome: 'ok', usage }
}

/**
 * The single AI seam. Governor → quota → (fake | gateway call with structured output) →
 * semantic validation → one repair → FatalTaskError; always logs one llm_calls entry.
 */
export async function runTask<I, O>(
  task: TaskDef<I, O>,
  input: I,
  ctx: TaskContext,
): Promise<TaskResult<O>> {
  const started = Date.now()
  const log: Logger = (outcome, usage, model) =>
    ctx.hooks.logCall(callEntry(task, ctx, { outcome, usage, model, started }))
  const primary = attemptPlan(task.role)[0]?.model ?? 'unknown'

  await runGates(ctx, log, primary)

  const result = isFakeMode(ctx)
    ? await runFake(task, input, log)
    : await runLive(task, input, ctx, log)
  return { ...result, latencyMs: Date.now() - started }
}
