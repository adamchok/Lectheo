import 'server-only'
import {
  AiPausedError,
  FatalTaskError,
  type LlmCallEntry,
  type TaskContext,
  type TaskHooks,
} from '@lectheo/ai'
import { llmCalls } from '@lectheo/db'
import type { Actor } from './auth'
import { appDb, type DbLike } from './db'
import { serverEnv } from './env'
import { ApiError } from './errors'
import { consume, evaluateSpend, markAiDegraded } from './quota'

export interface AiContextOptions {
  /** The user the call is for (quota + ledger). Omit for system work (pipeline on behalf of a lecture). */
  actor?: Actor | null
  lectureId?: string
  /** true for new processing / generation: blocks on intake_paused as well as ai_paused. */
  intake?: boolean
  /** Skip the per-user llm_tasks quota (e.g. pipeline steps already counted as `lectures`). */
  skipQuota?: boolean
  db?: DbLike
}

/**
 * The only place the web app wires packages/ai to the database (Architecture §5.1):
 * governor before every call, per-user llm_tasks quota, one llm_calls row per call.
 */
export function aiHooks(opts: AiContextOptions = {}): TaskHooks {
  const db = opts.db ?? appDb()
  const { actor } = opts
  return {
    checkBudget: async () => {
      const status = await evaluateSpend(db, serverEnv().AI_PROD_BUDGET_USD)
      if (status.aiPaused) throw new ApiError('ai_paused')
      if (opts.intake && status.intakePaused) throw new ApiError('intake_paused')
    },
    consumeQuota:
      actor && !opts.skipQuota
        ? async () => {
            await consume(actor, 'llm_tasks', db)
          }
        : undefined,
    logCall: async (entry: LlmCallEntry) => {
      await db.insert(llmCalls).values({
        ...entry,
        costUsd: entry.costUsd ?? 0,
        gatewayKey: serverEnv().AI_GATEWAY_KEY_NAME,
      })
    },
  }
}

/** TaskContext for runTask / streamPersona / checkLeak. */
export function aiContext(opts: AiContextOptions = {}): TaskContext {
  return {
    userId: opts.actor?.userId,
    lectureId: opts.lectureId,
    hooks: aiHooks(opts),
  }
}

/**
 * Maps packages/ai errors to API errors. Call in a catch around runTask in route services.
 * Gateway 402 → sticky ai_degraded flag + 503 ai_paused (Architecture §8).
 */
export async function toApiError(err: unknown, db: DbLike = appDb()): Promise<unknown> {
  if (err instanceof AiPausedError) {
    await markAiDegraded(db)
    return new ApiError('ai_paused')
  }
  if (err instanceof FatalTaskError) return new ApiError('upstream_unavailable')
  return err
}
