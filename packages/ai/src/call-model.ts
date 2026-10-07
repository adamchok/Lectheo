import { gateway } from '@ai-sdk/gateway'
import type { LanguageModel } from 'ai'
import { AiPausedError, isBudgetExhausted, isTransient } from './errors'
import { roleConfig, type ModelChoice, type ReasoningEffort, type Role } from './models'
import type { TaskContext } from './types'

export const DEFAULT_RETRY_DELAY_MS = 750

export function isFakeMode(ctx?: Pick<TaskContext, 'fake'>): boolean {
  return ctx?.fake ?? process.env['AI_FAKE'] === '1'
}

export function resolveModel(ctx: Pick<TaskContext, 'resolveModel'>, slug: string): LanguageModel {
  return ctx.resolveModel ? ctx.resolveModel(slug) : gateway(slug)
}

/**
 * Attempt plan (Architecture §8): primary, primary again (1 retry), then the role's fallback.
 * `reasoning` overrides the primary's effort (e.g. reasoner at low effort for on-demand items).
 */
export function attemptPlan(role: Role, reasoning?: ReasoningEffort): readonly ModelChoice[] {
  const cfg = roleConfig(role)
  if (cfg.direct) {
    throw new Error(`Role "${role}" calls the ${cfg.direct} API directly, never the AI Gateway`)
  }
  const primary = reasoning ? { ...cfg.primary, reasoning } : cfg.primary
  return cfg.fallback ? [primary, primary, cfg.fallback] : [primary, primary]
}

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

export interface FallbackResult<T> {
  readonly value: T
  readonly choice: ModelChoice
}

/**
 * Runs `call` along the attempt plan. Transient errors (429 / 5xx / timeout) advance to the next
 * attempt; HTTP 402 throws AiPausedError; anything else is rethrown immediately.
 * SDK-level retries must be disabled by the caller (`maxRetries: 0`) so retries don't multiply.
 */
export async function withFallback<T>(
  plan: readonly ModelChoice[],
  ctx: Pick<TaskContext, 'retryDelayMs'>,
  call: (choice: ModelChoice) => Promise<T>,
): Promise<FallbackResult<T>> {
  let lastError: unknown = new Error('empty attempt plan')
  for (const [i, choice] of plan.entries()) {
    try {
      return { value: await call(choice), choice }
    } catch (error) {
      if (isBudgetExhausted(error)) throw new AiPausedError({ cause: error })
      if (!isTransient(error)) throw error
      lastError = error
      const next = plan[i + 1]
      if (next && next.model === choice.model) {
        await sleep(ctx.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
      }
    }
  }
  throw lastError
}
