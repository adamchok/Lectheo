import { lt, rateLimits, sql } from '@lectheo/db'
import type { DbLike } from './db'

/*
 * Fixed-window counters in `rate_limits` (security audit row 5). One atomic upsert-increment per
 * request, so concurrent requests can't both slip under the limit.
 * ponytail: fixed window allows up to 2× the limit across a window boundary; fine for abuse
 * damping, use a sliding window if it ever needs to be exact.
 */

export interface RateLimit {
  readonly limit: number
  readonly windowMs: number
}

/** Sample sign-ins per client IP (POST /session/sample). */
export const SAMPLE_SIGNIN_LIMIT: RateLimit = { limit: 5, windowMs: 10 * 60_000 }

/** Counts one request for `key`; false once the window's count exceeds the limit. */
export async function takeRateLimit(
  db: DbLike,
  key: string,
  { limit, windowMs }: RateLimit,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs)
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count })
  return (row?.count ?? 0) <= limit
}

/** Deletes windows that started before `before` (old counters are never read again). */
export async function pruneRateLimits(db: DbLike, before: Date): Promise<void> {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, before))
}
