import { activities, items, uuidv7 } from '@lectheo/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FEATURES } from '../features'
import { getCourseMap } from './map'
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

/* F4b entry gating: the map flag and the next-step recommender only offer transfer while an
   unseen verified transfer item exists for this user. */

const TRANSFER_ITEM = '0190a000-0000-7000-8000-0000000c0001'
const SESSION_2 = '0190a000-0000-7000-8000-0000000b0002'

let f: Fixture

/** FEATURES is read-only in app code; map/next read it per call. */
const setTransferFlag = (on: boolean) => Object.assign(FEATURES, { transfer: on })

beforeEach(async () => {
  f = await createFixture()
})
afterEach(() => {
  setTransferFlag(true)
})

const addTransferItem = () =>
  f.db.insert(items).values({
    id: TRANSFER_ITEM,
    conceptId: ID.C3,
    lectureId: ID.L2,
    kind: 'transfer',
    variant: 1,
    status: 'verified',
    publicPayload: { prompt: 'Apply arrays.' },
    segmentIdxs: [1],
    promptVersion: 'test',
    model: 'fake',
  })

/** A's transfer activity on the item: the bank is now exhausted for A only. */
const useItem = () =>
  f.db.insert(activities).values({
    id: uuidv7(),
    userId: ID.A,
    conceptId: ID.C3,
    type: 'transfer',
    itemId: TRANSFER_ITEM,
    turnBudget: 0,
    rubricSnapshot: { kind: 'item', rubric: { criteria: [] } },
  })

const availability = async (actor = ACTOR_A) =>
  Object.fromEntries(
    (await getCourseMap(actor, ID.LIB, f.db)).nodes.map((n) => [n.id, n.transferAvailable]),
  )

describe('map transferAvailable', () => {
  it('is true only for concepts with an item this user has not seen', async () => {
    expect(await availability()).toEqual({ [ID.C1]: false, [ID.C2]: false, [ID.C3]: false })
    await addTransferItem()
    expect((await availability())[ID.C3]).toBe(true)

    await useItem()
    expect((await availability())[ID.C3]).toBe(false)
    expect((await availability(ACTOR_B))[ID.C3]).toBe(true)
  })

  it('is false everywhere when the feature is off', async () => {
    await addTransferItem()
    setTransferFlag(false)
    expect((await availability())[ID.C3]).toBe(false)
  })
})

describe('next step offers transfer only with an unseen item', () => {
  /** C3 tops the ranking (latest answer wrong) with spot_flaw and teach_back already passed. */
  async function practicedC3(): Promise<void> {
    for (const lectureId of [ID.L1, ID.L2]) await addMarker(f, { lectureId, userId: ID.A })
    await addSession(f, { id: ID.SESSION, userId: ID.A, lectureId: ID.L1, completed: true })
    await addSession(f, { id: SESSION_2, userId: ID.A, lectureId: ID.L2, completed: true })
    for (const [activityType, minutesAgo] of [
      ['spot_flaw', 120],
      ['teach_back', 100],
    ] as const) {
      await addAttempt(f, {
        userId: ID.A,
        conceptId: ID.C3,
        activityType,
        outcome: 'correct',
        minutesAgo,
      })
    }
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C3,
      activityType: 'diagnostic',
      confidence: 'unsure',
      outcome: 'incorrect',
    })
  }

  it('without an item: keeps practicing spot_flaw', async () => {
    await practicedC3()
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      kind: 'activity',
      conceptId: ID.C3,
      activityType: 'spot_flaw',
    })
  })

  it('with an unseen item: transfer; once used: back to spot_flaw', async () => {
    await practicedC3()
    await addTransferItem()
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      conceptId: ID.C3,
      activityType: 'transfer',
    })
    await useItem()
    expect(await getNextStep(ACTOR_A, ID.LIB, f.db)).toMatchObject({
      conceptId: ID.C3,
      activityType: 'spot_flaw',
    })
  })
})
