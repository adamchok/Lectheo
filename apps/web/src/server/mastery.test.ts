import { beforeEach, describe, expect, it } from 'vitest'
import { addAttempt, addSession, createFixture, type Fixture, ID } from './courses/test-fixtures'
import { loadMasteryForUser } from './mastery'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

const stateOf = async (conceptId: string, userId = ID.A) =>
  (await loadMasteryForUser(f.db, userId, [conceptId])).get(conceptId)

describe('loadMasteryForUser (computed on read)', () => {
  it('is gray with no attempts and returns an empty map for no concepts', async () => {
    expect((await stateOf(ID.C1))?.state).toBe('gray')
    expect((await loadMasteryForUser(f.db, ID.A, [])).size).toBe(0)
  })

  it('needs independent correct answers in 2 activity types for green', async () => {
    const base = { userId: ID.A, conceptId: ID.C1, outcome: 'correct' as const }
    await addAttempt(f, {
      ...base,
      activityType: 'diagnostic',
      confidence: 'sure',
      minutesAgo: 30,
    })
    expect((await stateOf(ID.C1))?.state).toBe('amber')
    await addAttempt(f, { ...base, activityType: 'spot_flaw', minutesAgo: 20 })
    expect((await stateOf(ID.C1))?.state).toBe('green')
  })

  it('ignores invalid outcomes and other users', async () => {
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C1,
      activityType: 'stump',
      outcome: 'invalid',
    })
    await addAttempt(f, {
      userId: ID.B,
      conceptId: ID.C1,
      activityType: 'spot_flaw',
      outcome: 'incorrect',
    })
    expect((await stateOf(ID.C1))?.state).toBe('gray')
    expect((await stateOf(ID.C1, ID.B))?.state).toBe('red')
  })

  it('joins is_follow_up so a right follow-up clears a sure-wrong slip', async () => {
    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await f.exec(`
      INSERT INTO diagnostic_responses (session_id, item_id, is_follow_up, confidence, correct)
      VALUES ('${ID.SESSION}', '${ID.ITEM}', false, 'sure', false),
             ('${ID.SESSION}', '${ID.ITEM2}', true, 'unsure', true);
    `)
    const diag = { userId: ID.A, conceptId: ID.C1, activityType: 'diagnostic' }
    const inSession = { ...diag, sessionId: ID.SESSION }
    await addAttempt(f, {
      ...inSession,
      itemId: ID.ITEM,
      confidence: 'sure',
      outcome: 'incorrect',
      minutesAgo: 5,
    })
    await addAttempt(f, {
      ...inSession,
      itemId: ID.ITEM2,
      confidence: 'unsure',
      outcome: 'correct',
      minutesAgo: 4,
    })
    // Without the join the second answer would not count as a follow-up → red confident mistake.
    expect(await stateOf(ID.C1)).toMatchObject({ state: 'amber', confidentMistake: false })
  })

  it('flags a confident mistake (sure + wrong, no follow-up) as red', async () => {
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C2,
      activityType: 'diagnostic',
      confidence: 'sure',
      outcome: 'incorrect',
    })
    expect(await stateOf(ID.C2)).toMatchObject({ state: 'red', confidentMistake: true })
  })
})
