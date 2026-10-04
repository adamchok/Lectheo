import type { Role } from './models'
import type { LlmCallEntry, LlmOutcome, TaskContext } from './types'
import { ZERO_USAGE, type UsageTotals } from './usage'

export type Logger = (outcome: LlmOutcome, usage: UsageTotals, model: string) => Promise<void>

export interface TaskIdentity {
  readonly name: string
  readonly role: Role
  readonly promptVersion: string
}

/** Runs a hook; if it throws, logs the blocked outcome and rethrows the hook's own error. */
export async function gate(
  hook: (() => Promise<void>) | undefined,
  onBlocked: () => Promise<void>,
): Promise<void> {
  if (!hook) return
  try {
    await hook()
  } catch (error) {
    await onBlocked()
    throw error
  }
}

export function callEntry(
  task: TaskIdentity,
  ctx: Pick<TaskContext, 'userId' | 'lectureId'>,
  call: { outcome: LlmOutcome; usage: UsageTotals; model: string; started: number },
): LlmCallEntry {
  return {
    task: task.name,
    role: task.role,
    model: call.model,
    promptVersion: task.promptVersion,
    userId: ctx.userId ?? null,
    lectureId: ctx.lectureId ?? null,
    inputTokens: call.usage.inputTokens,
    cachedTokens: call.usage.cachedTokens,
    outputTokens: call.usage.outputTokens,
    costUsd: call.usage.costUsd,
    latencyMs: Date.now() - call.started,
    outcome: call.outcome,
  }
}

/** Governor first (global), then the per-user quota, so a paused app doesn't burn user quota. */
export async function runGates(ctx: TaskContext, log: Logger, model: string): Promise<void> {
  await gate(ctx.hooks.checkBudget, () => log('budget_blocked', ZERO_USAGE, model))
  await gate(ctx.hooks.consumeQuota, () => log('quota_blocked', ZERO_USAGE, model))
}
