import {
  activities,
  attempts,
  courses,
  diagnosticResponses,
  diagnosticSessions,
  eq,
  messages,
  usageCounters,
} from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from '../db'
import { FEATURES } from '../features'
import { ACTIVITY_HANDLERS } from './registry'
import type { ActivityTypeHandler } from './types'
import { createActivity, getActivity, postMessage, showExplanation, takeHint } from './service'
import { submitActivity } from './submit'
import { ALICE, BOB, IDS, newId, seedFixture } from './test-fixture'

vi.mock('server-only', () => ({}))

let db: DbLike

beforeEach(async () => {
  db = await seedFixture()
})

const spotFlaw = (id = newId()) => ({ id, conceptId: IDS.concept, type: 'spot_flaw' as const })

describe('POST /activities', () => {
  it('is idempotent on the client id and counts the quota once', async () => {
    const input = spotFlaw()
    const first = await createActivity(ALICE, input, db)
    const again = await createActivity(ALICE, input, db)

    expect(again).toEqual(first)
    expect(first).toMatchObject({ type: 'spot_flaw', turnBudget: 6, hintsAvailable: 2 })
    expect(await db.select().from(activities)).toHaveLength(1)
    const [quota] = await db
      .select()
      .from(usageCounters)
      .where(eq(usageCounters.metric, 'activities'))
    expect(quota?.count).toBe(1)
  })

  it("returns 404 when another user replays someone else's id", async () => {
    const input = spotFlaw()
    await createActivity(ALICE, input, db)
    await expect(createActivity(BOB, input, db)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('never serves an item the user already saw, then 409s when the bank is empty', async () => {
    const a = await createActivity(ALICE, spotFlaw(), db)
    const b = await createActivity(ALICE, spotFlaw(), db)
    const rows = await db.select().from(activities)

    expect(new Set(rows.map((r) => r.itemId))).toEqual(new Set([IDS.flawed, IDS.noFlaw]))
    expect(a).not.toEqual(b)
    await expect(createActivity(ALICE, spotFlaw(), db)).rejects.toMatchObject({
      code: 'invalid_state',
      message: 'No new practice item available yet',
    })
  })

  it('skips items the user answered in a diagnostic', async () => {
    const [session] = await db
      .insert(diagnosticSessions)
      .values({ userId: BOB.userId, lectureId: IDS.lecture, plannedItemIds: [IDS.flawed] })
      .returning()
    if (!session) throw new Error('session not created')
    await db
      .insert(diagnosticResponses)
      .values({ sessionId: session.id, itemId: IDS.flawed, confidence: 'sure' })

    const id = newId()
    await createActivity(BOB, spotFlaw(id), db)
    const [row] = await db.select().from(activities).where(eq(activities.id, id))
    expect(row?.itemId).toBe(IDS.noFlaw)
  })

  it('hides disabled types and unknown concepts behind 404', async () => {
    const was = FEATURES.stump
    Object.assign(FEATURES, { stump: false })
    try {
      await expect(
        createActivity(ALICE, { id: newId(), conceptId: IDS.concept, type: 'stump' }, db),
      ).rejects.toMatchObject({ code: 'not_found' })
    } finally {
      Object.assign(FEATURES, { stump: was })
    }
    await expect(
      createActivity(ALICE, { ...spotFlaw(), conceptId: newId() }, db),
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('ownership', () => {
  it("404s an activity on a concept in another user's personal course", async () => {
    await db
      .update(courses)
      .set({ kind: 'personal', ownerId: BOB.userId })
      .where(eq(courses.id, IDS.course))
    await expect(createActivity(ALICE, spotFlaw(), db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(createActivity(BOB, spotFlaw(), db)).resolves.toMatchObject({ type: 'spot_flaw' })
  })

  it("returns 404 for every route on another user's activity", async () => {
    const { id } = await createActivity(ALICE, spotFlaw(), db)
    const verdict = { verdict: 'correct' }

    await expect(getActivity(BOB, id, db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(postMessage(BOB, id, 'hi', db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(takeHint(BOB, id, db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(showExplanation(BOB, id, db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(submitActivity(BOB, id, verdict, db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getActivity(ALICE, 'not-a-uuid', db)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('turn budget', () => {
  it('allows 6 questions and rejects the 7th with 409', async () => {
    const { id } = await createActivity(ALICE, spotFlaw(), db)
    for (let i = 1; i <= 6; i++) {
      const reply = await postMessage(ALICE, id, `Question ${i}?`, db)
      expect(reply).toMatchObject({ turnsLeft: 6 - i })
    }
    await expect(postMessage(ALICE, id, 'One more?', db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    const view = await getActivity(ALICE, id, db)
    expect(view.turnsUsed).toBe(6)
    expect(view.messages).toHaveLength(12)
  })
})

describe('GET /activities/{id}', () => {
  it('never returns invisible messages', async () => {
    const { id } = await createActivity(ALICE, spotFlaw(), db)
    await postMessage(ALICE, id, 'Why is lookup O(1)?', db)
    await db
      .insert(messages)
      .values({ activityId: id, role: 'persona', content: 'BLOCKED DRAFT', visible: false })

    const view = await getActivity(ALICE, id, db)
    expect(view.messages.map((m) => m.role)).toEqual(['student', 'persona'])
    expect(JSON.stringify(view)).not.toContain('BLOCKED DRAFT')
    expect(view.scenario?.sentences.length).toBeGreaterThanOrEqual(3)
  })

  it("names the concept's course and its kind (map link, library license notice)", async () => {
    const { id } = await createActivity(ALICE, spotFlaw(), db)
    const view = await getActivity(ALICE, id, db)
    expect(view).toMatchObject({ courseId: IDS.course, courseKind: 'library' })
  })
})

describe('hints and explanation', () => {
  it('a hint marks the next attempt assisted', async () => {
    const { id } = await createActivity(ALICE, spotFlaw(), db)
    const hint = await takeHint(ALICE, id, db)
    expect(hint).toMatchObject({ hintsUsed: 1, hintsLeft: 1 })
    await takeHint(ALICE, id, db)
    await expect(takeHint(ALICE, id, db)).rejects.toMatchObject({ code: 'invalid_state' })

    await submitActivity(ALICE, id, { verdict: 'correct' }, db)
    const [attempt] = await db.select().from(attempts).where(eq(attempts.activityId, id))
    expect(attempt?.assisted).toBe(true)
  })

  it('"Show me" marks later tries assisted; an unassisted try is independent', async () => {
    const plain = await createActivity(ALICE, spotFlaw(), db)
    await submitActivity(ALICE, plain.id, { verdict: 'correct' }, db)

    const shown = await createActivity(ALICE, spotFlaw(), db)
    const explanation = await showExplanation(ALICE, shown.id, db)
    expect(explanation.explanation.length).toBeGreaterThan(0)
    expect(explanation.sources[0]).toMatchObject({ lectureId: IDS.lecture, idx: 1 })
    await submitActivity(ALICE, shown.id, { verdict: 'correct' }, db)

    const rows = await db.select().from(attempts)
    const byActivity = new Map(rows.map((r) => [r.activityId, r.assisted]))
    expect(byActivity.get(plain.id)).toBe(false)
    expect(byActivity.get(shown.id)).toBe(true)
  })
})

describe('submit retry rule for a no-turn handler (default maxTries)', () => {
  // A stub on the `transfer` slot: no turns, no retryNeedsNewBody, never correct.
  const stub: ActivityTypeHandler<'transfer'> = {
    type: 'transfer',
    turnBudget: 0,
    hintsAvailable: 0,
    start: async (ctx) => ({
      itemId: null,
      rubricSnapshot: { kind: 'key_points', keyPoints: ctx.concept.keyPoints },
      persona: null,
    }),
    publicStart: async () => ({ prompt: 'Write swap.' }),
    submit: async () => ({
      checks: null,
      criteria: [],
      score: 1,
      maxScore: 2,
      outcome: 'partial',
      feedback: { guidingQuestion: 'What does C copy?', hint: null },
      rationale: null,
      judgeModel: null,
      sources: [],
    }),
    explanation: async () => ({ explanation: 'e', sources: [] }),
    finalReveal: async () => ({ explanation: 'e', rubric: [] }),
  }

  it('an identical retry body counts as try 2 (not a replay of try 1)', async () => {
    const saved = { handler: ACTIVITY_HANDLERS.transfer, flag: FEATURES.transfer }
    Object.assign(ACTIVITY_HANDLERS, { transfer: stub })
    Object.assign(FEATURES, { transfer: true })
    try {
      const { id } = await createActivity(
        ALICE,
        { id: newId(), conceptId: IDS.concept, type: 'transfer' },
        db,
      )
      const body = { answer: 'void swap(int *a, int *b)' }
      const try1 = await submitActivity(ALICE, id, body, db)
      const try2 = await submitActivity(ALICE, id, body, db)
      expect(try1).toMatchObject({ tryNo: 1, final: false })
      expect(try2).toMatchObject({ tryNo: 2, final: true })
    } finally {
      Object.assign(ACTIVITY_HANDLERS, { transfer: saved.handler })
      Object.assign(FEATURES, { transfer: saved.flag })
    }
  })
})
