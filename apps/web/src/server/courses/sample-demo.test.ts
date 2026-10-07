import { concepts, eq } from '@lectheo/db'
import { LIBRARY_COURSE_ID, SEED_STUDENT_ID, conceptId, lectureId, seedAll } from '@lectheo/db/seed'
import { createTestDb } from '@lectheo/db/testing'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { conceptsWithUnseenItem } from '../activities/items'
import type { Actor } from '../auth'
import type { DbLike } from '../db'
import { getCourseMap } from './map'
import { getNextStep } from './next'

vi.mock('server-only', () => ({}))

/*
 * The sample account's first screen (Product Spec F0.3, §4.1): every visitor gets a clone of the
 * seed student, so the seed student's map is what a judge sees. It must show mixed mastery and
 * offer a ready item for every activity type on the judge's concept (Pointers).
 */

const SAMPLE: Actor = { userId: SEED_STUDENT_ID, kind: 'sample', isSample: true }
const POINTERS = conceptId('pointers')

let db: DbLike

beforeAll(async () => {
  db = (await createTestDb()) as unknown as DbLike
  await seedAll(db as never) // includes the seed student's profile
})

describe('sample account demo data', () => {
  it('map shows every mastery state, Pointers red with a confident mistake', async () => {
    const map = await getCourseMap(SAMPLE, LIBRARY_COURSE_ID, db)
    const states = new Set(map.nodes.map((n) => n.mastery.state))
    expect([...states].sort()).toEqual(['amber', 'gray', 'green', 'red'])

    const pointers = map.nodes.find((n) => n.id === POINTERS)
    expect(pointers?.mastery).toMatchObject({ state: 'red', confidentMistake: true })
    expect(pointers?.transferAvailable).toBe(true)
  })

  it('Pointers is ready for all four activity types; L5 is ready to study', async () => {
    for (const kind of ['spot_flaw', 'transfer'] as const) {
      const ready = await conceptsWithUnseenItem(db, SAMPLE.userId, [POINTERS], kind)
      expect(ready.has(POINTERS), kind).toBe(true)
    }
    // Teach-back and stump need no bank item: both grade against the concept's key points.
    const [pointers] = await db
      .select({ keyPoints: concepts.keyPoints })
      .from(concepts)
      .where(eq(concepts.id, POINTERS))
    expect(pointers?.keyPoints.length).toBeGreaterThanOrEqual(3)
    expect(await getNextStep(SAMPLE, LIBRARY_COURSE_ID, db)).toMatchObject({
      kind: 'study',
      lectureId: lectureId('l5'),
    })
  })
})
