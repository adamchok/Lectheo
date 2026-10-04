import { CreateActivityResponse, SubmitResponse } from '@lectheo/contracts'
import { activities, attempts, eq, items, itemSecrets, usageCounters } from '@lectheo/db'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from '../db'
import { FEATURES } from '../features'
import { DAILY_LIMITS } from '../quota'
import { conceptsWithUnseenItem } from './items'
import { createActivity, getActivity, showExplanation, takeHint } from './service'
import { submitActivity } from './submit'
import { ALICE, BOB, IDS, newId, seedFixture } from './test-fixture'
import { FALLBACK_QUESTION, quotesAnswer } from './transfer'

vi.mock('server-only', () => ({}))

/** Per-test overrides of the fake judge-transfer output (other tasks run unchanged). */
const judge = vi.hoisted(() => ({ question: null as string | null, full: false }))
vi.mock('@lectheo/ai', async (importOriginal) => {
  const ai = await importOriginal<typeof import('@lectheo/ai')>()
  return {
    ...ai,
    runTask: (async (task, input, ctx) => {
      const res = await ai.runTask(task, input, ctx)
      if (task.name !== 'judge-transfer') return res
      const out = res.output as { criteria: { score: number }[]; guidingQuestion: string }
      const criteria = judge.full
        ? (input as { rubric: typeof RUBRIC }).rubric.criteria.map((c, i) => ({
            ...out.criteria[i],
            score: c.max,
          }))
        : out.criteria
      return {
        ...res,
        output: { ...out, criteria, guidingQuestion: judge.question ?? out.guidingQuestion },
      }
    }) as typeof ai.runTask,
  }
})

const T1 = '0190b000-0000-7000-8000-0000000000f1'
const T2 = '0190b000-0000-7000-8000-0000000000f2'
const MODEL_SOLUTION = 'Allocate strlen(s) + 1 bytes so the terminator fits.'
const RUBRIC = {
  criteria: [
    { id: 'c1', label: 'Allocation size', description: 'Adds one byte for NUL.', max: 2 },
    { id: 'c2', label: 'Loop bound', description: 'Copies the terminator too.', max: 2 },
  ],
}
/** Strings only the answer key / rubric hold: none may leave the server before the final try. */
const HIDDEN = [MODEL_SOLUTION, 'Allocation size', 'Adds one byte', 'Loop bound', 'terminator too']

let db: DbLike

/** FEATURES is read-only in app code; the registry reads it per call. */
const setTransferFlag = (on: boolean) => Object.assign(FEATURES, { transfer: on })

async function seedTransfer(): Promise<void> {
  const base = {
    conceptId: IDS.concept,
    lectureId: IDS.lecture,
    kind: 'transfer' as const,
    status: 'verified' as const,
    segmentIdxs: [2],
    promptVersion: 'test',
    model: 'fake',
  }
  await db.insert(items).values([
    { ...base, id: T1, variant: 1, publicPayload: { prompt: 'Copy a string safely.' } },
    { ...base, id: T2, variant: 2, publicPayload: { prompt: 'Grow a hash table.' } },
  ])
  const answerKey = { modelSolution: MODEL_SOLUTION, explanation: 'Strings end in NUL.' }
  await db.insert(itemSecrets).values([
    { itemId: T1, answerKey, rubric: RUBRIC, hints: null, leakKeywords: [] },
    { itemId: T2, answerKey, rubric: RUBRIC, hints: null, leakKeywords: [] },
  ])
}

beforeEach(async () => {
  db = await seedFixture()
  await seedTransfer()
})
afterEach(() => {
  setTransferFlag(true)
  judge.question = null
  judge.full = false
})

const start = () =>
  createActivity(ALICE, { id: newId(), conceptId: IDS.concept, type: 'transfer' }, db)

function expectHidden(value: unknown): void {
  const json = JSON.stringify(value)
  for (const s of HIDDEN) expect(json).not.toContain(s)
}

describe('transfer', () => {
  it('start returns only the prompt and never repeats an item for a user', async () => {
    const first = await start()
    expect(first).toEqual({
      id: first.id,
      type: 'transfer',
      concept: { id: IDS.concept, name: 'hash tables' },
      prompt: 'Copy a string safely.',
    })
    expect(CreateActivityResponse.parse(first)).toEqual(first)
    expectHidden(first)
    const [row] = await db.select().from(activities).where(eq(activities.id, first.id))
    expect(row?.rubricSnapshot).toEqual({ kind: 'item', rubric: RUBRIC })

    expect(await start()).toMatchObject({ prompt: 'Grow a hash table.' })
    await expect(start()).rejects.toMatchObject({ code: 'invalid_state' })
    // Another user still gets the first item.
    const bob = await createActivity(
      BOB,
      { id: newId(), conceptId: IDS.concept, type: 'transfer' },
      db,
    )
    expect(bob).toMatchObject({ prompt: 'Copy a string safely.' })
  })

  it('GET carries the prompt (reload)', async () => {
    const { id } = await start()
    const view = await getActivity(ALICE, id, db)
    expect(view).toMatchObject({ type: 'transfer', prompt: 'Copy a string safely.', tries: [] })
    expectHidden(view)
  })

  it('try 1 → guiding question, no answer; try 2 → reveal with rubric', async () => {
    const { id } = await start()
    // Fake judge: first criterion full, the rest 1 → 3/4 = 75 % → partial.
    const try1 = await submitActivity(ALICE, id, { answer: 'malloc(strlen(s))' }, db)
    expect(try1).toMatchObject({ tryNo: 1, final: false, outcome: 'partial', score: 3 })
    expect(try1).toMatchObject({ maxScore: 4, canRetry: true, checks: null })
    expect(try1.criteria.map((c) => c.label)).toEqual(['Criterion 1', 'Criterion 2'])
    expect(try1.feedback.guidingQuestion).toBeTruthy()
    expect(try1.explanation).toBeUndefined()
    expect(try1.rubric).toBeUndefined()
    expect(try1.sources[0]).toMatchObject({ lectureId: IDS.lecture, idx: 2 })
    expectHidden(try1)
    expectHidden(await getActivity(ALICE, id, db))

    const try2 = await submitActivity(ALICE, id, { answer: 'malloc(strlen(s) + 1)' }, db)
    expect(try2).toMatchObject({ tryNo: 2, final: true, canRetry: false })
    expect(try2.feedback).toEqual({ guidingQuestion: null, hint: null })
    expect(try2.explanation).toContain(MODEL_SOLUTION)
    expect(try2.rubric).toEqual(
      RUBRIC.criteria.map(({ id, label, description }) => ({ id, label, description })),
    )
    expect(SubmitResponse.parse(try1)).toEqual(try1)
    expect(SubmitResponse.parse(try2)).toEqual(try2)

    const rows = await db.select().from(attempts).where(eq(attempts.activityId, id))
    expect(rows.map((r) => [r.activityType, r.tryNo, r.assisted])).toEqual([
      ['transfer', 1, false],
      ['transfer', 2, false],
    ])
    await expect(submitActivity(ALICE, id, { answer: 'again' }, db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })

  it('"Show me" reveals the model solution and marks the retry assisted', async () => {
    const { id } = await start()
    await submitActivity(ALICE, id, { answer: 'first go' }, db)
    const shown = await showExplanation(ALICE, id, db)
    expect(shown.explanation).toContain(MODEL_SOLUTION)
    expect(shown.sources).toHaveLength(1)
    await submitActivity(ALICE, id, { answer: 'second go' }, db)
    const rows = await db.select().from(attempts).where(eq(attempts.activityId, id))
    expect(rows.find((r) => r.tryNo === 2)?.assisted).toBe(true)
  })

  it('replaces a guiding question that leaks the answer', async () => {
    // The fake judge asks "What does C copy when you pass an int to a function?"
    await db
      .update(itemSecrets)
      .set({ leakKeywords: ['copy'] })
      .where(eq(itemSecrets.itemId, T1))
    const { id } = await start()
    const try1 = await submitActivity(ALICE, id, { answer: 'x' }, db)
    expect(try1.feedback.guidingQuestion).toBe(FALLBACK_QUESTION)
  })

  it('rejects an empty or too long answer with 400', async () => {
    const { id } = await start()
    for (const answer of ['', 'x'.repeat(4001)]) {
      await expect(submitActivity(ALICE, id, { answer }, db)).rejects.toMatchObject({
        code: 'validation_failed',
      })
    }
  })

  it('is a hidden feature (404) when the flag is off', async () => {
    setTransferFlag(false)
    await expect(start()).rejects.toMatchObject({ code: 'not_found' })
  })

  it('counts against the activities quota (429)', async () => {
    const day = new Date().toISOString().slice(0, 10)
    const limit = DAILY_LIMITS.sample.activities
    await db
      .insert(usageCounters)
      .values({ userId: ALICE.userId, day, metric: 'activities', count: limit })
    await expect(start()).rejects.toMatchObject({ code: 'quota_exceeded' })
  })

  it('entry gating: available until every item was used', async () => {
    const has = () => conceptsWithUnseenItem(db, ALICE.userId, [IDS.concept], 'transfer')
    expect(await has()).toEqual(new Set([IDS.concept]))
    await start()
    await start()
    expect(await has()).toEqual(new Set())
    expect(await conceptsWithUnseenItem(db, BOB.userId, [IDS.concept], 'transfer')).toEqual(
      new Set([IDS.concept]),
    )
  })

  it('blocks a guiding question that quotes the model solution (realistic empty keywords)', async () => {
    judge.question = `Did you remember to allocate strlen(s) + 1 bytes so the terminator fits?`
    const { id } = await start()
    const try1 = await submitActivity(ALICE, id, { answer: 'malloc(strlen(s))' }, db)
    expect(try1.feedback.guidingQuestion).toBe(FALLBACK_QUESTION)
    expectHidden(try1)
    expectHidden(await getActivity(ALICE, id, db))
  })

  it('a correct try 1 closes at once with the reveal', async () => {
    judge.full = true
    const { id } = await start()
    const res = await submitActivity(ALICE, id, { answer: 'strlen(s) + 1, copy the NUL' }, db)
    expect(res).toMatchObject({ tryNo: 1, final: true, outcome: 'correct', score: 4, maxScore: 4 })
    expect(res.canRetry).toBe(false)
    expect(res.feedback.guidingQuestion).toBeNull()
    expect(res.explanation).toContain(MODEL_SOLUTION)
    expect(res.rubric?.map((r) => r.id)).toEqual(['c1', 'c2'])
  })

  it('has no hint ladder (/hints → 404)', async () => {
    const { id } = await start()
    await expect(takeHint(ALICE, id, db)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('reopening: "Show me" on a closed activity also returns the rubric (not before)', async () => {
    const { id } = await start()
    await submitActivity(ALICE, id, { answer: 'first' }, db)
    expect((await showExplanation(ALICE, id, db)).rubric).toBeUndefined()
    await submitActivity(ALICE, id, { answer: 'second' }, db)
    const reopened = await showExplanation(ALICE, id, db)
    expect(reopened.explanation).toContain(MODEL_SOLUTION)
    expect(reopened.rubric?.map((r) => r.label)).toEqual(['Allocation size', 'Loop bound'])
  })
})

describe('quotesAnswer()', () => {
  const prompt = 'A program copies a string s into t.'
  it('flags a 5-word run of the model solution the problem does not contain', () => {
    expect(quotesAnswer('So allocate strlen(s) + 1 bytes, right?', MODEL_SOLUTION, prompt)).toBe(
      true,
    )
    expect(quotesAnswer('What must fit after the last character?', MODEL_SOLUTION, prompt)).toBe(
      false,
    )
  })
  it('ignores runs the problem itself states', () => {
    const echo = 'A program copies a string s into t. What could go wrong?'
    expect(quotesAnswer(echo, `${prompt} Then fix it.`, prompt)).toBe(false)
  })
})
