import {
  AnswerResponse,
  ConfidenceResponse,
  DiagnosticResultsResponse,
  DiagnosticSessionResponse,
  McqAnswerKey,
  McqPublicPayload,
  StartDiagnosticResponse,
  type ConfidenceLevel,
} from '@lectheo/contracts'
import {
  activities,
  attempts,
  diagnosticSessions,
  eq,
  items,
  itemSecrets,
  markerConcepts,
  markers,
  profiles,
  uuidv7,
} from '@lectheo/db'
import { conceptId, lectureId, seedAll } from '@lectheo/db/seed'
import { createTestDb } from '@lectheo/db/testing'
import { NO_FLAGS_NOTE } from '@lectheo/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '../auth'
import type { DbLike } from '../db'
import { answerItem } from './answer'
import { getResults } from './results'
import { getSession, recordConfidence } from './session'
import { startDiagnostic } from './start'

vi.mock('server-only', () => ({}))

const ALICE: Actor = {
  userId: '0190c000-0000-7000-8000-000000000001',
  kind: 'sample',
  isSample: true,
}
const BOB: Actor = {
  userId: '0190c000-0000-7000-8000-000000000002',
  kind: 'sample',
  isSample: true,
}
const L5 = lectureId('l5')
const HASH_TABLES = conceptId('hash_tables')

let db: DbLike

beforeEach(async () => {
  db = (await createTestDb()) as unknown as DbLike
  await seedAll(db as never)
  await db.insert(profiles).values([
    { id: ALICE.userId, kind: 'sample' },
    { id: BOB.userId, kind: 'sample' },
  ])
})

async function flag(actor: Actor, concept: string) {
  const id = uuidv7()
  await db
    .insert(markers)
    .values({ id, lectureId: L5, userId: actor.userId, kind: 'lost', tMs: 1_000, capture: 'watch' })
  await db.insert(markerConcepts).values({ markerId: id, conceptId: concept, overlapScore: 0.9 })
}

/** Test-only peek at the answer key. */
async function key(itemId: string): Promise<{ right: string; wrong: string; secrets: string[] }> {
  const [item] = await db.select().from(items).where(eq(items.id, itemId))
  const [secret] = await db.select().from(itemSecrets).where(eq(itemSecrets.itemId, itemId))
  const answerKey = McqAnswerKey.parse(secret?.answerKey)
  const options = McqPublicPayload.parse(item?.publicPayload).options
  const wrong = options.find((o) => o.id !== answerKey.correctOptionId)
  if (!wrong) throw new Error('no wrong option')
  const meta = Object.values((secret?.distractorMeta ?? {}) as Record<string, { whyWrong: string }>)
  return {
    right: answerKey.correctOptionId,
    wrong: wrong.id,
    secrets: [answerKey.explanation, ...meta.map((m) => m.whyWrong)],
  }
}

async function answer(
  actor: Actor,
  sid: string,
  itemId: string,
  confidence: ConfidenceLevel,
  correct: boolean,
): Promise<AnswerResponse> {
  await recordConfidence(actor, sid, itemId, confidence, db)
  const k = await key(itemId)
  return AnswerResponse.parse(await answerItem(actor, sid, itemId, correct ? k.right : k.wrong, db))
}

const at = <T>(list: readonly T[], i: number): T => {
  const value = list[i]
  if (value === undefined) throw new Error(`no element ${i}`)
  return value
}

describe('POST /lectures/{id}/diagnostic', () => {
  it('plans flagged concepts first, stems only, and resumes the active session', async () => {
    await flag(ALICE, HASH_TABLES)
    const start = StartDiagnosticResponse.parse(await startDiagnostic(ALICE, L5, db))

    expect(start.items).toHaveLength(4) // 6 concepts → ceil(6/2)+1
    expect(at(start.items, 0).conceptId).toBe(HASH_TABLES)
    expect(new Set(start.items.map((i) => i.conceptId)).size).toBe(4)
    expect(start.note).toBeUndefined()
    expect(JSON.stringify(start)).not.toMatch(/options/)

    expect(StartDiagnosticResponse.parse(await startDiagnostic(ALICE, L5, db))).toEqual(start)
    const sessions = await db
      .select()
      .from(diagnosticSessions)
      .where(eq(diagnosticSessions.userId, ALICE.userId))
    expect(sessions).toHaveLength(1)
  })

  it('says so when there are no flags', async () => {
    const start = await startDiagnostic(ALICE, L5, db)
    expect(start.note).toBe(NO_FLAGS_NOTE)
  })

  it('never repeats an item across diagnostics or after an activity', async () => {
    const first = await startDiagnostic(ALICE, L5, db)
    for (const item of first.items) await answer(ALICE, first.sessionId, item.id, 'unsure', true)
    const done = await getSession(ALICE, first.sessionId, db)
    expect(done.status).toBe('completed')
    const firstIds = new Set(done.items.map((i) => i.id))

    // An item used in an activity counts as seen too.
    const usedByActivity = (await db.select().from(items).where(eq(items.lectureId, L5))).find(
      (i) => i.kind === 'diagnostic_mcq' && !firstIds.has(i.id),
    )
    if (!usedByActivity) throw new Error('fixture too small')
    await db.insert(activities).values({
      id: uuidv7(),
      userId: ALICE.userId,
      conceptId: usedByActivity.conceptId,
      type: 'spot_flaw',
      itemId: usedByActivity.id,
    })

    const second = await startDiagnostic(ALICE, L5, db)
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(second.items.length).toBeGreaterThan(0)
    for (const item of second.items) {
      expect(firstIds.has(item.id)).toBe(false)
      expect(item.id).not.toBe(usedByActivity.id)
    }
  })
})

describe('confidence → answer', () => {
  it('409s an answer before confidence, then reveals options only after it', async () => {
    const { sessionId, items: planned } = await startDiagnostic(ALICE, L5, db)
    const itemId = at(planned, 0).id
    const k = await key(itemId)

    await expect(answerItem(ALICE, sessionId, itemId, k.right, db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    const options = ConfidenceResponse.parse(
      await recordConfidence(ALICE, sessionId, itemId, 'sure', db),
    )
    expect(options.options.length).toBeGreaterThanOrEqual(3)
    expect(await recordConfidence(ALICE, sessionId, itemId, 'sure', db)).toEqual(options)
    await expect(recordConfidence(ALICE, sessionId, itemId, 'guess', db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })

  it('leaks no secrets before answering', async () => {
    const start = await startDiagnostic(ALICE, L5, db)
    const itemId = at(start.items, 0).id
    const k = await key(itemId)
    const before = [
      StartDiagnosticResponse.parse(start),
      ConfidenceResponse.parse(
        await recordConfidence(ALICE, start.sessionId, itemId, 'unsure', db),
      ),
      DiagnosticSessionResponse.parse(await getSession(ALICE, start.sessionId, db)),
    ].map((r) => JSON.stringify(r))
    for (const json of before) {
      expect(json).not.toMatch(/correctOptionId|answerKey|distractor|explanation|whyWrong/)
      for (const secret of k.secrets) expect(json).not.toContain(secret)
    }
  })

  it('grades once: a retry returns the stored result and writes one attempt', async () => {
    const { sessionId, items: planned } = await startDiagnostic(ALICE, L5, db)
    const itemId = at(planned, 0).id
    const k = await key(itemId)
    await recordConfidence(ALICE, sessionId, itemId, 'unsure', db)

    const first = await answerItem(ALICE, sessionId, itemId, k.right, db)
    const retry = await answerItem(ALICE, sessionId, itemId, k.wrong, db)
    expect(first).toMatchObject({ correct: true, finding: 'unsure_right', followUp: null })
    expect(retry).toEqual(first)
    const rows = await db.select().from(attempts).where(eq(attempts.userId, ALICE.userId))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      activityType: 'diagnostic',
      confidence: 'unsure',
      outcome: 'correct',
      assisted: false,
    })
    expect(first.mastery.state).toBe('amber')
    expect(first.source?.lectureId).toBe(L5)
  })
})

describe('adaptive follow-up', () => {
  it('sure + wrong → follow-up on the same concept; wrong again → confident mistake', async () => {
    await flag(ALICE, HASH_TABLES)
    const start = await startDiagnostic(ALICE, L5, db)
    const core = at(start.items, 0)

    const first = await answer(ALICE, start.sessionId, core.id, 'sure', false)
    expect(first.finding).toBe('possible_confident_mistake')
    expect(first.whyYourChoiceIsWrong).toEqual(expect.any(String))
    const followUpId = first.followUp?.itemId
    if (!followUpId) throw new Error('expected a follow-up')
    expect(start.items.map((i) => i.id)).not.toContain(followUpId)
    const [fu] = await db.select().from(items).where(eq(items.id, followUpId))
    expect(fu?.conceptId).toBe(HASH_TABLES)

    const second = await answer(ALICE, start.sessionId, followUpId, 'sure', false)
    expect(second.finding).toBe('confident_mistake')
    expect(second.followUp).toBeNull()
    expect(second.mastery).toMatchObject({ state: 'red', confidentMistake: true })

    for (const item of start.items.slice(1)) {
      await answer(ALICE, start.sessionId, item.id, 'sure', true)
    }
    const session = await getSession(ALICE, start.sessionId, db)
    expect(session.status).toBe('completed')
    expect(session.items.find((i) => i.id === followUpId)?.isFollowUp).toBe(true)

    const results = DiagnosticResultsResponse.parse(await getResults(ALICE, start.sessionId, db))
    expect(results.findings[0]).toMatchObject({
      itemId: core.id,
      conceptId: HASH_TABLES,
      conceptName: expect.stringMatching(/hash table/i),
      finding: 'confident_mistake',
    })
    expect(results.findings[0]?.source?.lectureId).toBe(L5)
    expect(results.findings).toHaveLength(4) // the follow-up is merged into its core row
    expect(results.note).toBeUndefined()
  })

  it('follow-up right → possible slip', async () => {
    const start = await startDiagnostic(ALICE, L5, db)
    const first = await answer(ALICE, start.sessionId, at(start.items, 0).id, 'sure', false)
    const followUpId = first.followUp?.itemId
    if (!followUpId) throw new Error('expected a follow-up')
    const second = await answer(ALICE, start.sessionId, followUpId, 'unsure', true)
    expect(second.finding).toBe('possible_slip')
    const results = await getResults(ALICE, start.sessionId, db)
    expect(results.findings[0]?.finding).toBe('possible_slip')
  })

  it('caps follow-ups at 2 per session', async () => {
    const start = await startDiagnostic(ALICE, L5, db)
    const sid = start.sessionId
    expect((await answer(ALICE, sid, at(start.items, 0).id, 'sure', false)).followUp).not.toBeNull()
    expect((await answer(ALICE, sid, at(start.items, 1).id, 'sure', false)).followUp).not.toBeNull()
    const third = await answer(ALICE, sid, at(start.items, 2).id, 'sure', false)
    expect(third.followUp).toBeNull()
    expect(third.finding).toBe('confident_mistake')
    const [row] = await db.select().from(diagnosticSessions).where(eq(diagnosticSessions.id, sid))
    expect(row?.followUpsUsed).toBe(2)
    expect(row?.plannedItemIds).toHaveLength(6)
  })

  it('does not follow up unsure + wrong', async () => {
    const start = await startDiagnostic(ALICE, L5, db)
    const res = await answer(ALICE, start.sessionId, at(start.items, 0).id, 'unsure', false)
    expect(res).toMatchObject({ finding: 'wrong', followUp: null })
  })
})

describe('results', () => {
  it('orders confident mistakes → wrong → unsure-right → right', async () => {
    const start = await startDiagnostic(ALICE, L5, db)
    const sid = start.sessionId
    const [a, b, c, d] = [0, 1, 2, 3].map((i) => at(start.items, i).id)
    await answer(ALICE, sid, a!, 'sure', true)
    await answer(ALICE, sid, b!, 'unsure', true)
    await answer(ALICE, sid, c!, 'guess', false)
    const cm = await answer(ALICE, sid, d!, 'sure', false)
    await answer(ALICE, sid, cm.followUp?.itemId ?? '', 'sure', false)

    const results = DiagnosticResultsResponse.parse(await getResults(ALICE, sid, db))
    expect(results.findings.map((f) => [f.itemId, f.finding])).toEqual([
      [d, 'confident_mistake'],
      [c, 'wrong'],
      [b, 'unsure_right'],
      [a, 'right'],
    ])
    expect(results.summary).toEqual({
      total: 4,
      confidentMistakes: 1,
      wrong: 1,
      unsureRight: 1,
      right: 1,
    })
    expect(results.note).toBe(NO_FLAGS_NOTE)
  })
})

describe('ownership', () => {
  it("returns 404 for another user's session on every endpoint", async () => {
    const { sessionId, items: planned } = await startDiagnostic(ALICE, L5, db)
    const itemId = at(planned, 0).id
    await recordConfidence(ALICE, sessionId, itemId, 'sure', db)
    const notFound = { code: 'not_found' }
    await expect(getSession(BOB, sessionId, db)).rejects.toMatchObject(notFound)
    await expect(recordConfidence(BOB, sessionId, itemId, 'sure', db)).rejects.toMatchObject(
      notFound,
    )
    await expect(answerItem(BOB, sessionId, itemId, 'a', db)).rejects.toMatchObject(notFound)
    await expect(getResults(BOB, sessionId, db)).rejects.toMatchObject(notFound)
  })

  it('404s an item outside the session and a malformed session id', async () => {
    const { sessionId, items: planned } = await startDiagnostic(ALICE, L5, db)
    const outside = (await db.select().from(items).where(eq(items.lectureId, L5))).find(
      (i) => !planned.some((p) => p.id === i.id),
    )
    if (!outside) throw new Error('fixture too small')
    await expect(recordConfidence(ALICE, sessionId, outside.id, 'sure', db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(
      recordConfidence(ALICE, 'nope', at(planned, 0).id, 'sure', db),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
