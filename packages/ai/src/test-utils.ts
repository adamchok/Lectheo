// Test-only helpers (imported by *.test.ts). Not exported from index.ts.
import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { LlmCallEntry, TaskContext, TaskHooks } from './types'

type CtxExtra = Partial<Omit<TaskContext, 'hooks'>> & { hooks?: Partial<TaskHooks> }

export type MockModel = MockLanguageModelV4
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>

export function jsonResult(value: unknown, opts: { cost?: string; reasoning?: number } = {}) {
  const result: GenerateResult = {
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: { total: 100, noCache: 60, cacheRead: 40, cacheWrite: undefined },
      outputTokens: { total: 20 + (opts.reasoning ?? 0), text: 20, reasoning: opts.reasoning },
    },
    warnings: [],
    ...(opts.cost ? { providerMetadata: { gateway: { cost: opts.cost } } } : {}),
  }
  return result
}

export function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: 'https://ai-gateway.test/v1',
    requestBodyValues: {},
    statusCode,
  })
}

/** A model whose successive doGenerate calls return/throw the given steps (last one repeats). */
export function scriptedModel(modelId: string, steps: readonly (GenerateResult | Error)[]) {
  let call = 0
  return new MockLanguageModelV4({
    provider: 'mock',
    modelId,
    doGenerate: async () => {
      const step = steps[Math.min(call, steps.length - 1)]
      call += 1
      if (!step) throw new Error('no scripted step')
      if (step instanceof Error) throw step
      return step
    },
  })
}

export interface Recorder {
  readonly entries: LlmCallEntry[]
  readonly ctx: (extra?: CtxExtra) => TaskContext
}

export function recorder(): Recorder {
  const entries: LlmCallEntry[] = []
  return {
    entries,
    ctx: (extra: CtxExtra = {}) => ({
      userId: 'user-1',
      lectureId: 'lecture-1',
      retryDelayMs: 0,
      fake: false,
      ...extra,
      hooks: {
        logCall: async (e) => {
          entries.push(e)
        },
        ...extra.hooks,
      },
    }),
  }
}

export const SEGMENTS = [
  { idx: 0, text: 'A pointer is just an address in memory.' },
  { idx: 1, text: 'malloc gives you memory on the heap and returns its address.' },
  { idx: 2, text: 'When you are done, you must free that memory.' },
] as const
