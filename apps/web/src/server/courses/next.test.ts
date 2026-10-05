import { beforeEach, describe, expect, it } from 'vitest'
import { getNextStep } from './next'
import {
  ACTOR_A,
  ACTOR_B,
  addAttempt,
  addMarker,
  addSession,
  createFixture,
  type Fixture,
  ID,
} from './test-fixtures'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

const SESSION_2 = '0190a000-0000-7000-8000-0000000b0002'

describe('GET /courses/{id}/next', () => {
  it('404s another user’s personal course and malformed ids', async () => {
    await expect(getNextStep(ACTOR_B, ID.P, f.db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getNextStep(ACTOR_B, 'nope', f.db)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('goes watch → diagnostic → activity', async () => {
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toEqual({
      kind: 'watch',
      lectureId: ID.L1,
      reason: "Lecture 1 is ready. Watch it and tap when you're lost.",
    })

    await addMarker(f, { lectureId: ID.L1, userId: ID.A })
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'watch',
      lectureId: ID.L2,
    })

    await addMarker(f, { lectureId: ID.L2, userId: ID.A })
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'diagnostic',
      lectureId: ID.L1,
    })

    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C3,
      activityType: 'diagnostic',
      confidence: 'unsure',
      outcome: 'incorrect',
    })
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'activity',
      conceptId: ID.C3,
      conceptName: 'Arrays',
      activityType: 'spot_flaw',
    })
  })

  it('ranks a confident mistake first and skips practice types already passed', async () => {
    for (const lectureId of [ID.L1, ID.L2]) await addMarker(f, { lectureId, userId: ID.A })
    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C3,
      activityType: 'diagnostic',
      confidence: 'unsure',
      outcome: 'incorrect',
    })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C2,
      activityType: 'spot_flaw',
      outcome: 'correct',
      minutesAgo: 90,
    })
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C2,
      activityType: 'diagnostic',
      confidence: 'sure',
      outcome: 'incorrect',
    })
    const step = await getNextStep(ACTOR_A, ID.LIB, f.db)
    expect(step).toMatchObject({ kind: 'activity', conceptId: ID.C2, activityType: 'teach_back' })
    expect(step.reason).toContain('You were sure about Loops')
  })

  it('sends an undiagnosed personal lecture to the diagnostic', async () => {
    expect(await getNextStep(ACTOR_A, ID.P, f.db)).toMatchObject({
      kind: 'diagnostic',
      lectureId: ID.PL1,
      reason: 'Check what stuck from Week 1 with a quick diagnostic.',
    })
    await expect(getNextStep(ACTOR_B, ID.P, f.db)).rejects.toMatchObject({ code: 'not_found' })
  })
})
