import { streamText, type LanguageModel, type ToolSet } from 'ai'
import { attemptPlan, isFakeMode, resolveModel } from './call-model'
import { isBudgetExhausted } from './errors'
import { callEntry, runGates, type Logger } from './log'
import { roleConfig, type ReasoningEffort, type Role } from './models'
import { buildMessages, FAKE_MODEL, type PromptSpec } from './run-task'
import type { TaskContext } from './types'
import { usageFrom, ZERO_USAGE } from './usage'

export interface StreamTaskDef<I> {
  readonly name: string
  readonly role: Role
  readonly promptVersion: string
  readonly buildPrompt: (input: I) => PromptSpec
  readonly maxOutputTokens: number
  readonly reasoning?: ReasoningEffort
  /** Deterministic reply streamed when AI_FAKE=1. */
  readonly fakeText: (input: I) => string
}

export function defineStreamTask<I>(def: StreamTaskDef<I>): StreamTaskDef<I> {
  return Object.freeze({ ...def })
}

export type PersonaStream = ReturnType<typeof streamText<ToolSet>>

/** SDK-level retries for the stream start; the gateway then tries the role's fallback model. */
const STREAM_MAX_RETRIES = 1
const FAKE_CHUNK_DELAY_MS = 5

async function fakeStreamModel(text: string): Promise<LanguageModel> {
  // ponytail: reuse the SDK's own mock model for fake streaming instead of hand-rolling one.
  const { MockLanguageModelV4 } = await import('ai/test')
  const { simulateReadableStream } = await import('ai')
  const words = text.split(/(?<=\s)/)
  const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: words.length, text: words.length, reasoning: undefined },
  }
  return new MockLanguageModelV4({
    provider: 'fake',
    modelId: FAKE_MODEL,
    doStream: async () => ({
      stream: simulateReadableStream({
        chunkDelayInMs: FAKE_CHUNK_DELAY_MS,
        chunks: [
          { type: 'text-start' as const, id: 't1' },
          ...words.map((delta) => ({ type: 'text-delta' as const, id: 't1', delta })),
          { type: 'text-end' as const, id: 't1' },
          {
            type: 'finish' as const,
            finishReason: { unified: 'stop' as const, raw: undefined },
            usage,
          },
        ],
      }),
    }),
  })
}

/**
 * Streams a persona reply (teach-back friend). Runs the governor + quota hooks first, logs one
 * llm_calls row when the stream ends (or errors), and returns the AI SDK result so the route can
 * `result.consumeStream()` and `return result.toUIMessageStreamResponse({ onFinish })`.
 *
 * Fallback: a mid-stream model switch isn't possible, so the role's fallback is handed to the
 * gateway (`providerOptions.gateway.models`), which fails over before the first token.
 */
export async function streamPersona<I>(
  task: StreamTaskDef<I>,
  input: I,
  ctx: TaskContext,
): Promise<PersonaStream> {
  const started = Date.now()
  const log: Logger = (outcome, usage, model) =>
    ctx.hooks.logCall(callEntry(task, ctx, { outcome, usage, model, started }))
  const primary = attemptPlan(task.role, task.reasoning)[0] ?? roleConfig(task.role).primary
  await runGates(ctx, log, primary.model)

  const fake = isFakeMode(ctx)
  const spec = task.buildPrompt(input)
  const fallback = roleConfig(task.role).fallback
  const model = fake
    ? await fakeStreamModel(task.fakeText(input))
    : resolveModel(ctx, primary.model)

  return streamText({
    model,
    instructions: spec.system,
    messages: buildMessages(spec),
    maxOutputTokens: task.maxOutputTokens,
    reasoning: primary.reasoning,
    maxRetries: STREAM_MAX_RETRIES,
    ...(ctx.abortSignal ? { abortSignal: ctx.abortSignal } : {}),
    ...(!fake && fallback ? { providerOptions: { gateway: { models: [fallback.model] } } } : {}),
    onEnd: async (event) => {
      const usage = fake
        ? { ...ZERO_USAGE, costUsd: 0 }
        : usageFrom(event.totalUsage, event.providerMetadata)
      await log('ok', usage, fake ? FAKE_MODEL : event.response.modelId || primary.model)
    },
    onError: async ({ error }) => {
      // ponytail: a 402 here can't become a 503 (headers are sent); the next request's
      // checkBudget hook / runTask will surface ai_paused.
      await log(isBudgetExhausted(error) ? 'budget_blocked' : 'failed', ZERO_USAGE, primary.model)
    },
  })
}
