import { appFlags, llmCalls, profiles } from '@lectheo/db'
import { createTestDb } from '@lectheo/db/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Actor } from './auth'
import type { DbLike } from './db'
import { ApiError } from './errors'
import { assertAiAvailable, assertIntakeOpen, consume, evaluateSpend, readAppFlags } from './quota'

const SAMPLE: Actor = {
  userId: '0190a000-0000-7000-8000-000000000001',
  kind: 'sample',
  isSample: true,
}
const GOOGLE: Actor = {
  userId: '0190a000-0000-7000-8000-000000000002',
  kind: 'google',
  isSample: false,
}
const NOW = new Date('2026-10-04T15:30:00Z')

let db: DbLike

beforeEach(async () => {
  db = (await createTestDb()) as unknown as DbLike
  await db.insert(profiles).values([
    { id: SAMPLE.userId, kind: 'sample' },
    { id: GOOGLE.userId, kind: 'google' },
  ])
})

const addSpend = (costUsd: number, createdAt: Date) =>
  db.insert(llmCalls).values({
    task: 't',
    role: 'r',
    model: 'm',
    promptVersion: 'v1',
    costUsd,
    outcome: 'ok',
    createdAt,
  })

describe('consume()', () => {
  it('allows up to the tier limit, then throws 429 with resetAt at next UTC midnight', async () => {
    expect(await consume(SAMPLE, 'lectures', db, NOW)).toBe(1)
    const err = await consume(SAMPLE, 'lectures', db, NOW).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).toMatchObject({
      code: 'quota_exceeded',
      status: 429,
      details: { metric: 'lectures', resetAt: '2026-10-05T00:00:00.000Z' },
    })
  })

  it('uses per-tier limits and separate days', async () => {
    for (let i = 1; i <= 3; i++) expect(await consume(GOOGLE, 'lectures', db, NOW)).toBe(i)
    await expect(consume(GOOGLE, 'lectures', db, NOW)).rejects.toThrow(ApiError)
    expect(await consume(GOOGLE, 'lectures', db, new Date('2026-10-05T00:00:01Z'))).toBe(1)
  })
})

describe('app flags and the spend governor', () => {
  it('starts open', async () => {
    expect(await readAppFlags(db)).toEqual({ aiPaused: false, intakePaused: false })
    await expect(assertIntakeOpen(db)).resolves.toBeUndefined()
  })

  it('pauses intake at ≥ $3 in the last hour, and lifts it once the hour has passed', async () => {
    await addSpend(3.5, new Date(NOW.getTime() - 10 * 60_000))
    const status = await evaluateSpend(db, 25, NOW)
    expect(status).toMatchObject({ intakePaused: true, aiPaused: false, spentLastHourUsd: 3.5 })
    await expect(assertIntakeOpen(db)).rejects.toMatchObject({ code: 'intake_paused', status: 503 })
    await expect(assertAiAvailable(db)).resolves.toBeUndefined()

    const later = new Date(NOW.getTime() + 2 * 60 * 60_000)
    expect(await evaluateSpend(db, 25, later)).toMatchObject({ intakePaused: false })
  })

  it('pauses intake at ≥ 75% and AI at ≥ 95% of the budget (AI pause is sticky)', async () => {
    const old = new Date(NOW.getTime() - 5 * 60 * 60_000)
    await addSpend(19, old)
    expect(await evaluateSpend(db, 25, NOW)).toMatchObject({ intakePaused: true, aiPaused: false })
    await addSpend(5, old)
    expect(await evaluateSpend(db, 25, NOW)).toMatchObject({ intakePaused: true, aiPaused: true })
    await expect(assertAiAvailable(db)).rejects.toMatchObject({ code: 'ai_paused' })
    // Raising the budget doesn't clear ai_degraded on its own (it may come from a gateway 402).
    expect(await evaluateSpend(db, 1000, NOW)).toMatchObject({ aiPaused: true })
    await db.update(appFlags).set({ aiDegraded: false })
    expect(await evaluateSpend(db, 1000, NOW)).toMatchObject({
      aiPaused: false,
      intakePaused: false,
    })
  })
})
