import { rateLimits } from '@lectheo/db'
import { createTestDb } from '@lectheo/db/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DbLike } from './db'
import { pruneRateLimits, takeRateLimit } from './rate-limit'

const LIMIT = { limit: 2, windowMs: 60_000 }
const T0 = new Date('2026-10-06T10:00:10Z')

let db: DbLike
beforeEach(async () => {
  db = (await createTestDb()) as unknown as DbLike
})

const take = (key: string, now = T0) => takeRateLimit(db, key, LIMIT, now)

describe('takeRateLimit', () => {
  it('allows up to the limit per key and window, then refuses', async () => {
    expect([await take('a'), await take('a'), await take('a')]).toEqual([true, true, false])
    expect(await take('b')).toBe(true)
    expect(await take('a', new Date(T0.getTime() + 60_000))).toBe(true)
  })

  it('counts concurrent requests atomically', async () => {
    const results = await Promise.all([take('a'), take('a'), take('a'), take('a')])
    expect(results.filter(Boolean)).toHaveLength(2)
  })

  it('prunes old windows', async () => {
    await take('a')
    await take('a', new Date(T0.getTime() + 60_000))
    await pruneRateLimits(db, new Date(T0.getTime() + 30_000))
    expect(await db.select().from(rateLimits)).toHaveLength(1)
  })
})
