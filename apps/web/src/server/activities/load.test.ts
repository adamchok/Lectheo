import { conceptOccurrences, concepts, eq, lectures } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from '../db'
import { buildContext } from './load'
import { ALICE, IDS, newId, seedFixture } from './test-fixture'
import type { ActivityRow, ConceptRow } from './types'

vi.mock('server-only', () => ({}))

let db: DbLike

beforeEach(async () => {
  db = await seedFixture()
})

async function contextFor(concept: ConceptRow) {
  const activity = { id: newId(), itemId: null } as ActivityRow
  return buildContext(db, ALICE, activity, concept)
}

async function fixtureConcept(): Promise<ConceptRow> {
  const [row] = await db.select().from(concepts).where(eq(concepts.id, IDS.concept))
  if (!row) throw new Error('fixture concept missing')
  return row
}

describe('ActivityContext.titles()', () => {
  it("returns the course and the concept's first-lecture title, loaded once", async () => {
    const ctx = await contextFor(await fixtureConcept())
    const select = vi.spyOn(db, 'select')
    expect(await ctx.titles()).toEqual({ courseTitle: 'CS50x', lectureTitle: 'L5' })
    const calls = select.mock.calls.length
    await ctx.titles()
    expect(select.mock.calls.length).toBe(calls)
  })

  it('falls back to the most salient occurrence lecture, like stump', async () => {
    const other = newId()
    await db
      .insert(lectures)
      .values({ id: other, courseId: IDS.course, title: 'L6', seq: 6, source: 'library' })
    await db.insert(conceptOccurrences).values([
      { conceptId: IDS.concept, lectureId: IDS.lecture, segmentIdxs: [0], salience: 0.2 },
      { conceptId: IDS.concept, lectureId: other, segmentIdxs: [0], salience: 0.9 },
    ])
    const ctx = await contextFor({ ...(await fixtureConcept()), firstLectureId: null })
    expect(await ctx.titles()).toEqual({ courseTitle: 'CS50x', lectureTitle: 'L6' })
  })

  it('gives a null lecture title when the concept has no lecture at all', async () => {
    const ctx = await contextFor({ ...(await fixtureConcept()), firstLectureId: null })
    expect(await ctx.titles()).toEqual({ courseTitle: 'CS50x', lectureTitle: null })
  })

  it('never fails the judge path when the course row is missing', async () => {
    const ctx = await contextFor({ ...(await fixtureConcept()), courseId: newId() })
    expect((await ctx.titles()).courseTitle).toBe('Untitled course')
  })
})
