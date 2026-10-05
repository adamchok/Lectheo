import {
  ActivityResponse,
  AuthorReplyResponse,
  CreateActivityResponse,
  HintResponse,
  SubmitResponse,
} from '@lectheo/contracts'
import { activities, attempts, eq, itemSecrets, llmCalls, messages } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from '../db'
import { createActivity, getActivity, postMessage, takeHint } from './service'
import { friendReplyTask } from '@lectheo/ai'
import { exchangesOf, friendReplyInput, questionOf, retryHintFor } from './teach-back'
import { submitActivity } from './submit'
import { ALICE, IDS, newId, SECRET_KEYS, seedFixture } from './test-fixture'

vi.mock('server-only', () => ({}))

let db: DbLike

beforeEach(async () => {
  db = await seedFixture()
})

/** Secret keys must never appear in a response before the final try. */
function expectNoSecrets(value: unknown): void {
  const json = JSON.stringify(value)
  for (const key of SECRET_KEYS) expect(json).not.toContain(`"${key}"`)
}

/** The first spot_flaw activity of a user gets the flawed item (variant 1; flaw in sentence 2). */
const startFlawed = () =>
  createActivity(ALICE, { id: newId(), conceptId: IDS.concept, type: 'spot_flaw' }, db)

const judgeCalls = async () =>
  (await db.select().from(llmCalls)).filter((c) => c.task === 'judge-correction').length

describe('spot_flaw', () => {
  it('a wrong verdict skips the judge and scores incorrect (≤ 2)', async () => {
    const { id } = await startFlawed()
    const res = await submitActivity(ALICE, id, { verdict: 'correct' }, db)

    expect(await judgeCalls()).toBe(0)
    expect(res).toMatchObject({ tryNo: 1, final: false, outcome: 'incorrect', maxScore: 6 })
    expect(res.score).toBeLessThanOrEqual(2)
    expect(res.checks).toEqual({ verdict: false, location: false })
    expect(res.feedback.guidingQuestion).toBeTruthy()
    const [attempt] = await db.select().from(attempts).where(eq(attempts.activityId, id))
    expect(attempt?.judgeModel).toBeNull()
  })

  it('try 1 partial → awaiting_retry → try 2 closes → a 3rd submit is 409', async () => {
    const { id } = await startFlawed()
    // Right sentence, no correction yet → 4/6 partial without a judge call.
    const noFix = { verdict: 'flawed', flawSentenceIdx: 2 }
    const try1 = await submitActivity(ALICE, id, noFix, db)

    expect(try1).toMatchObject({ tryNo: 1, final: false, outcome: 'partial', score: 4 })
    expect(try1).toMatchObject({ canRetry: true, checks: { verdict: true, location: true } })
    expect(try1.explanation).toBeUndefined()
    expect(try1.rubric).toBeUndefined()
    expect(try1.sources[0]).toMatchObject({ lectureId: IDS.lecture, idx: 1 })
    expect(try1.mastery).toMatchObject({ conceptId: IDS.concept, state: 'amber' })
    expectNoSecrets(try1)
    expect(await judgeCalls()).toBe(0)
    const [mid] = await db.select().from(activities).where(eq(activities.id, id))
    expect(mid?.status).toBe('awaiting_retry')

    // Same body again (client retry) → the stored attempt, no second judge call.
    const replay = await submitActivity(ALICE, id, noFix, db)
    expect(replay.attemptId).toBe(try1.attemptId)
    expect(await judgeCalls()).toBe(0)

    const right = { verdict: 'flawed', flawSentenceIdx: 2, correction: 'Collisions can happen.' }
    const try2 = await submitActivity(ALICE, id, right, db)
    expect(try2).toMatchObject({ tryNo: 2, final: true, outcome: 'correct', score: 6 })
    expect(try2.canRetry).toBe(false)
    expect(try2.explanation).toContain('same bucket')
    expect(try2.rubric?.map((r) => r.id)).toEqual(['verdict', 'location', 'correction'])
    expect(SubmitResponse.parse(try1)).toEqual(try1)
    expect(SubmitResponse.parse(try2)).toEqual(try2)
    const [closed] = await db.select().from(activities).where(eq(activities.id, id))
    expect(closed?.status).toBe('closed')

    await expect(submitActivity(ALICE, id, { verdict: 'correct' }, db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })

  it('a correct try 1 closes the activity at once', async () => {
    await startFlawed()
    const { id } = await startFlawed() // second activity → the no-flaw scenario
    const res = await submitActivity(ALICE, id, { verdict: 'correct' }, db)
    expect(res).toMatchObject({ final: true, outcome: 'correct', score: 2, maxScore: 2 })
    expect(res.rubric?.map((r) => r.id)).toEqual(['verdict'])
  })

  it('rejects an invalid body with 400', async () => {
    const { id } = await startFlawed()
    await expect(submitActivity(ALICE, id, { verdict: 'maybe' }, db)).rejects.toMatchObject({
      code: 'validation_failed',
    })
  })

  it('blocks leaking author drafts: stores them invisible and shows the deflection', async () => {
    const { id } = await startFlawed()
    // The fake author reply mentions "lecture"; make that a leak keyword.
    await db
      .update(itemSecrets)
      .set({ leakKeywords: ['lecture'] })
      .where(eq(itemSecrets.itemId, IDS.flawed))

    const res = await postMessage(ALICE, id, 'Is sentence 3 right?', db)
    expect(res).toMatchObject({ turnsLeft: 5 })
    const all = await db.select().from(messages).where(eq(messages.activityId, id))
    expect(all.filter((m) => !m.visible)).toHaveLength(2)
    expect(all.find((m) => !m.visible && m.guard?.regenerated)).toBeTruthy()

    const view = await getActivity(ALICE, id, db)
    expect(view.messages).toHaveLength(2)
    expect(view.messages[1]?.content).not.toContain('lecture')
  })

  it('never returns secrets from create, get, messages or hints', async () => {
    const created = await startFlawed()
    const reply = await postMessage(ALICE, created.id, 'Why?', db)
    const hint = await takeHint(ALICE, created.id, db)
    const view = await getActivity(ALICE, created.id, db)
    for (const body of [created, reply, hint, view]) expectNoSecrets(body)
    // The route's allow-list schemas accept the service output unchanged.
    expect(CreateActivityResponse.parse(created)).toEqual(created)
    expect(AuthorReplyResponse.parse(reply)).toEqual(reply)
    expect(HintResponse.parse(hint)).toEqual(hint)
    expect(ActivityResponse.parse(view)).toEqual(view)
    expect(hint.hint).toBe('Think about what a hash function guarantees.')
    // F5.2: the hint links to where the lecture covers it (the item's segments).
    expect(hint.sources.map((r) => r.idx)).toEqual([1, 2])
  })
})

describe('teach_back', () => {
  const startTeachBack = () =>
    createActivity(ALICE, { id: newId(), conceptId: IDS.concept, type: 'teach_back' }, db)

  it('starts with the persona opener and never exposes the key points', async () => {
    const created = await startTeachBack()
    expect(created).toMatchObject({
      type: 'teach_back',
      persona: { key: 'first_year', name: 'Sam, a curious first-year' },
      opener: expect.stringContaining('I missed the lecture on hash tables'),
      turnBudget: 6,
    })
    expectNoSecrets(created)
    const view = await getActivity(ALICE, created.id, db)
    expect(view.messages).toEqual([expect.objectContaining({ role: 'persona' })])
    expect(JSON.stringify(view)).not.toContain('chaining or probing')
  })

  it('streams the friend reply and persists both messages', async () => {
    const { id } = await startTeachBack()
    const res = await postMessage(ALICE, id, 'A hash function picks a bucket for each key.', db)
    if (!(res instanceof Response)) throw new Error('expected a streaming Response')

    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const body = await res.text()
    expect(body).toContain('"turnsLeft":5')

    const view = await getActivity(ALICE, id, db)
    expect(view.messages.map((m) => m.role)).toEqual(['persona', 'student', 'persona'])
    expect(view.turnsUsed).toBe(1)
  })

  it('grades key points, retries once, reveals the rubric only when final', async () => {
    const { id } = await startTeachBack()
    await expect(submitActivity(ALICE, id, {}, db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    const res = await postMessage(ALICE, id, 'Keys go to buckets via a hash function.', db)
    if (res instanceof Response) await res.text()

    const try1 = await submitActivity(ALICE, id, {}, db)
    expect(try1).toMatchObject({
      tryNo: 1,
      final: false,
      outcome: 'partial',
      score: 3,
      maxScore: 4,
    })
    expect(try1.criteria.map((c) => c.label)).toEqual(['Key point 1', 'Key point 2'])
    // F5.1: question, then a hint that counts the gaps without naming them (F5.3).
    expect(try1.feedback.guidingQuestion).toBeTruthy()
    expect(try1.feedback.hint).toContain('1 key point out of 2')
    expect(try1.checks).toBeNull()
    expect(try1.rubric).toBeUndefined()
    expectNoSecrets(try1)
    expect(JSON.stringify(try1)).not.toContain('chaining or probing')

    const bad = await submitActivity(ALICE, id, { extra: 1 }, db).catch((e: unknown) => e)
    expect(bad).toMatchObject({ code: 'validation_failed' })
    // Nothing new explained since try 1 → a duplicate submit, not the retry.
    expect((await submitActivity(ALICE, id, {}, db)).attemptId).toBe(try1.attemptId)

    const more = await postMessage(ALICE, id, 'Collisions go into a chain in the bucket.', db)
    if (more instanceof Response) await more.text()
    const final = await submitActivity(ALICE, id, {}, db)
    expect(final).toMatchObject({ tryNo: 2, final: true })
    expect(final.rubric?.map((r) => r.description)).toContain(
      'Collisions are handled by chaining or probing.',
    )
    expect(final.explanation).toBe(
      'A hash table stores key/value pairs in buckets chosen by a hash function.',
    )
  })
})

describe('teach_back helpers', () => {
  it('the friend prompt never contains the concept key points (ADR-009)', () => {
    const concept = {
      name: 'hash tables',
      summary: 'A hash table stores key/value pairs in buckets chosen by a hash function.',
      keyPoints: [
        { id: 'k1', text: 'Keys map to buckets via a hash function.' },
        { id: 'k2', text: 'Collisions are handled by chaining or probing.' },
      ],
    }
    const history = [{ role: 'student', text: 'It puts keys in buckets.' }] as const
    const json = JSON.stringify(
      friendReplyTask.buildPrompt(
        friendReplyInput(concept, { turnsUsed: 6, turnBudget: 6 }, history),
      ),
    )
    for (const k of concept.keyPoints) expect(json).not.toContain(k.text)
  })

  it('strips the persona style down to its question sentences', () => {
    expect(questionOf('Oh nice, that makes sense! But why a hash? And then what?')).toBe(
      'But why a hash? And then what?',
    )
    expect(questionOf('Thanks, I get it now.')).toBe('Thanks, I get it now.')
  })

  it('pairs each student answer with the friend question before it', () => {
    const turns = [
      { role: 'persona', text: 'Hmm. What is a bucket?' },
      { role: 'student', text: 'A slot in an array.' },
      { role: 'student', text: 'Each key maps to one.' },
    ] as const
    expect(exchangesOf(turns)).toEqual([
      { question: 'What is a bucket?', answer: 'A slot in an array.' },
      { question: '', answer: 'Each key maps to one.' },
    ])
  })

  it('hint counts open key points, null when all are covered', () => {
    expect(
      retryHintFor([
        { score: 2, max: 2 },
        { score: 0, max: 2 },
        { score: 1, max: 2 },
      ]),
    ).toContain('2 key points out of 3')
    expect(retryHintFor([{ score: 2, max: 2 }])).toBeNull()
  })
})
