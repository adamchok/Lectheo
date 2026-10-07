import type { UsageMetric } from '@lectheo/contracts'
import { and, appFlags, eq, gte, llmCalls, sql, usageCounters } from '@lectheo/db'
import type { Actor } from './auth'
import { appDb, type DbLike } from './db'
import { ApiError } from './errors'

/* Per-user daily quotas and the global spend governor (Architecture §9.2). */

const MB = 1024 * 1024
export const MINUTE_MS = 60_000

export type Tier = 'sample' | 'google'

export const DAILY_LIMITS: Record<Tier, Record<UsageMetric, number>> = {
  sample: { lectures: 1, reprocess: 2, llm_tasks: 60, activities: 30 },
  google: { lectures: 3, reprocess: 2, llm_tasks: 60, activities: 30 },
}

export const MEDIA_LIMITS: Record<Tier, { maxDurationMs: number; maxAudioBytes: number }> = {
  sample: { maxDurationMs: 20 * MINUTE_MS, maxAudioBytes: 20 * MB },
  google: { maxDurationMs: 120 * MINUTE_MS, maxAudioBytes: 50 * MB },
}

/** Governor thresholds: ≥ $3 in the last hour or ≥ 75% of budget pauses intake; ≥ 95% pauses AI. */
export const GOVERNOR = {
  hourlyIntakePauseUsd: 3,
  intakePauseFraction: 0.75,
  aiPauseFraction: 0.95,
  /** Google key (F10): ≥ 25% of its budget in one hour also pauses new YouTube lectures. */
  googleHourlyPauseFraction: 0.25,
} as const

/** ponytail: the `owner` account uses the Google tier. */
export const tierOf = (actor: Actor): Tier => (actor.isSample ? 'sample' : 'google')

/** Next UTC midnight, when daily counters reset. */
export function nextUtcMidnight(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

/**
 * Counts one use of `metric` for today (UTC) and throws 429 `quota_exceeded` past the limit.
 * ponytail: a rejected or failed operation still counts, except the explicit refunds
 * (`refundUsage`: a re-run that couldn't start, a YouTube video with no speech).
 */
export async function consume(
  actor: Actor,
  metric: UsageMetric,
  db: DbLike = appDb(),
  now = new Date(),
): Promise<number> {
  const day = now.toISOString().slice(0, 10)
  const [row] = await db
    .insert(usageCounters)
    .values({ userId: actor.userId, day, metric, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounters.userId, usageCounters.day, usageCounters.metric],
      set: { count: sql`${usageCounters.count} + 1` },
    })
    .returning({ count: usageCounters.count })
  const used = row?.count ?? 1
  const limit = DAILY_LIMITS[tierOf(actor)][metric]
  if (used > limit) {
    throw new ApiError('quota_exceeded', `You've used today's ${metric} limit.`, {
      metric,
      limit,
      resetAt: nextUtcMidnight(now).toISOString(),
    })
  }
  return used
}

/** Gives back one use of `metric` on the UTC day of `at` (never below zero). */
export async function refundUsage(
  db: DbLike,
  userId: string,
  metric: UsageMetric,
  at: Date,
): Promise<void> {
  await db
    .update(usageCounters)
    .set({ count: sql`greatest(${usageCounters.count} - 1, 0)` })
    .where(
      and(
        eq(usageCounters.userId, userId),
        eq(usageCounters.day, at.toISOString().slice(0, 10)),
        eq(usageCounters.metric, metric),
      ),
    )
}

export interface AppFlags {
  aiPaused: boolean
  intakePaused: boolean
}

export async function readAppFlags(db: DbLike = appDb()): Promise<AppFlags> {
  const [row] = await db.select().from(appFlags).where(eq(appFlags.id, 1)).limit(1)
  return { aiPaused: row?.aiDegraded ?? false, intakePaused: row?.intakePaused ?? false }
}

/** New processing / generation. AI paused implies intake paused. */
export async function assertIntakeOpen(db: DbLike = appDb()): Promise<void> {
  const flags = await readAppFlags(db)
  if (flags.aiPaused) throw new ApiError('ai_paused')
  if (flags.intakePaused) throw new ApiError('intake_paused')
}

/** Any LLM call. */
export async function assertAiAvailable(db: DbLike = appDb()): Promise<void> {
  if ((await readAppFlags(db)).aiPaused) throw new ApiError('ai_paused')
}

export interface SpendStatus extends AppFlags {
  spentLastHourUsd: number
  spentTotalUsd: number
}

/**
 * Global spend governor. Called by packages/ai (injected hook) before each runTask().
 * ai_degraded is sticky (it is also set on a gateway 402 and cleared by hand in Studio);
 * intake_paused is recomputed, so it lifts once the hourly spend drops.
 * Only rows paid by the prod gateway key count (llm_calls.gateway_key), so seeding and evals on
 * the dev key never eat into the judging budget.
 */
export async function evaluateSpend(
  db: DbLike,
  budgetUsd: number,
  now = new Date(),
): Promise<SpendStatus> {
  const hourAgo = new Date(now.getTime() - 60 * MINUTE_MS)
  const [spend] = await db
    .select({
      total: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)`,
      lastHour: sql<string>`coalesce(sum(${llmCalls.costUsd}) filter (where ${gte(llmCalls.createdAt, hourAgo)}), 0)`,
    })
    .from(llmCalls)
    .where(eq(llmCalls.gatewayKey, 'prod'))
  const spentTotalUsd = Number(spend?.total ?? 0)
  const spentLastHourUsd = Number(spend?.lastHour ?? 0)

  const current = await readAppFlags(db)
  const aiPaused = current.aiPaused || spentTotalUsd >= GOVERNOR.aiPauseFraction * budgetUsd
  const intakePaused =
    aiPaused ||
    spentLastHourUsd >= GOVERNOR.hourlyIntakePauseUsd ||
    spentTotalUsd >= GOVERNOR.intakePauseFraction * budgetUsd

  if (aiPaused !== current.aiPaused || intakePaused !== current.intakePaused) {
    await db
      .update(appFlags)
      .set({ aiDegraded: aiPaused, intakePaused, updatedAt: now })
      .where(eq(appFlags.id, 1))
  }
  return { aiPaused, intakePaused, spentLastHourUsd, spentTotalUsd }
}

/**
 * The direct Google key's own cap (ADR-017, F10.9): its calls are logged with gateway_key
 * 'google', outside the prod gateway budget. At 75 % (or 25 % within the last hour) new YouTube
 * lectures and their transcription Retries are refused; at 100 % transcription calls stop.
 * Other features never look at it.
 * ponytail: a check, not a reservation; concurrent starts can overshoot by the transcriptions
 * already running (≤ ~$0.85 each). The hourly pause bounds a burst; the Google budget alert backs it.
 */
export async function googleSpend(
  db: DbLike,
  budgetUsd: number,
  now = new Date(),
): Promise<{ spentUsd: number; intakePaused: boolean; exhausted: boolean }> {
  const hourAgo = new Date(now.getTime() - 60 * MINUTE_MS)
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${llmCalls.costUsd}), 0)`,
      lastHour: sql<string>`coalesce(sum(${llmCalls.costUsd}) filter (where ${gte(llmCalls.createdAt, hourAgo)}), 0)`,
    })
    .from(llmCalls)
    .where(eq(llmCalls.gatewayKey, 'google'))
  const spentUsd = Number(row?.total ?? 0)
  const lastHourUsd = Number(row?.lastHour ?? 0)
  return {
    spentUsd,
    intakePaused:
      spentUsd >= GOVERNOR.intakePauseFraction * budgetUsd ||
      lastHourUsd >= GOVERNOR.googleHourlyPauseFraction * budgetUsd,
    exhausted: spentUsd >= budgetUsd,
  }
}

export const YOUTUBE_PAUSED_MESSAGE = 'Adding YouTube lectures is paused for now. Try again later.'

/** New YouTube lectures (POST /lectures source youtube). */
export async function assertGoogleIntakeOpen(db: DbLike, budgetUsd: number): Promise<void> {
  if ((await googleSpend(db, budgetUsd)).intakePaused) {
    throw new ApiError('intake_paused', YOUTUBE_PAUSED_MESSAGE)
  }
}

/** Gateway 402 (key budget hit): same effect as the governor's AI pause. */
export async function markAiDegraded(db: DbLike): Promise<void> {
  await db
    .update(appFlags)
    .set({ aiDegraded: true, intakePaused: true, updatedAt: new Date() })
    .where(eq(appFlags.id, 1))
}
