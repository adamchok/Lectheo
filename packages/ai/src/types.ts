import type { LanguageModel } from 'ai'
import type { LLM_OUTCOMES } from '@lectheo/contracts'
import type { Role } from './models'

export type LlmOutcome = (typeof LLM_OUTCOMES)[number]

/** One row of `llm_calls` (Data Model §2). The web app inserts it in `hooks.logCall`. */
export interface LlmCallEntry {
  readonly task: string
  readonly role: Role
  /** Gateway slug actually used (fallback included), or 'fake' in AI_FAKE mode. */
  readonly model: string
  readonly promptVersion: string
  readonly userId: string | null
  readonly lectureId: string | null
  readonly inputTokens: number
  readonly cachedTokens: number
  /** Includes reasoning tokens. */
  readonly outputTokens: number
  /** From gateway response metadata; null when the gateway didn't report it. */
  readonly costUsd: number | null
  readonly latencyMs: number
  readonly outcome: LlmOutcome
  /** Who paid when not the app's gateway key: 'google' for the direct Google API (ADR-017). */
  readonly gatewayKey?: string
}

/** Injected by the web app — packages/ai never touches the database. */
export interface TaskHooks {
  /** Global spend governor. Throw (e.g. AppError('ai_paused')) to block the call. */
  readonly checkBudget?: () => Promise<void>
  /** Per-user daily `llm_tasks` quota. Throw to block the call. */
  readonly consumeQuota?: () => Promise<void>
  /** Insert into `llm_calls`. Awaited; errors propagate. */
  readonly logCall: (entry: LlmCallEntry) => Promise<void>
}

export interface TaskContext {
  readonly userId?: string
  readonly lectureId?: string
  readonly hooks: TaskHooks
  readonly abortSignal?: AbortSignal
  /** Test seam: map a gateway slug to a model. Defaults to `gateway(slug)`. */
  readonly resolveModel?: (slug: string) => LanguageModel
  /** Delay before retrying the same model after a transient error. */
  readonly retryDelayMs?: number
  /** Overrides AI_FAKE detection (tests). */
  readonly fake?: boolean
  /** Test seam for direct provider calls (the transcriber). Defaults to global fetch. */
  readonly fetch?: typeof fetch
}
