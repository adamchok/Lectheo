import { concepts, courses, eq, inArray, lectures } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoveObjects } from '../lectures/write'
import { ACTOR_A, ACTOR_B, addMarker, createFixture, type Fixture, ID } from './test-fixtures'
import { deleteCourse, renameCourse } from './write'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

describe('PATCH /courses/{id}', () => {
  it('renames an own course and returns its summary', async () => {
    const summary = await renameCourse(ACTOR_A, ID.P, 'Biology 101', f.db)
    expect(summary).toMatchObject({ id: ID.P, title: 'Biology 101', kind: 'personal' })
    expect(summary.lectureCount).toBe(2)
  })

  it('404s library courses and other users’ courses', async () => {
    await expect(renameCourse(ACTOR_A, ID.LIB, 'Mine', f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(renameCourse(ACTOR_B, ID.P, 'Mine', f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    const [row] = await f.db.select().from(courses).where(eq(courses.id, ID.P))
    expect(row?.title).toBe('Bio')
  })
})

describe('DELETE /courses/{id}', () => {
  const remove = () => vi.fn<RemoveObjects>(async () => undefined)
  const courseRows = () => f.db.select().from(courses).where(eq(courses.id, ID.P))

  it('deletes every lecture (with Storage) and the course; the library is untouched', async () => {
    await addMarker(f, { lectureId: ID.PL1, userId: ID.A, conceptId: ID.PC1 })
    const removeObjects = remove()
    await deleteCourse(ACTOR_A, ID.P, f.db, removeObjects)

    expect(await courseRows()).toEqual([])
    expect(
      await f.db
        .select()
        .from(lectures)
        .where(inArray(lectures.id, [ID.PL1, ID.PL2])),
    ).toEqual([])
    expect(await f.db.select().from(concepts).where(eq(concepts.courseId, ID.P))).toEqual([])
    expect(removeObjects).toHaveBeenCalledWith('audio', [`${ID.A}/${ID.PL1}`])
    expect(removeObjects).toHaveBeenCalledWith(
      'transcripts',
      expect.arrayContaining([`${ID.A}/${ID.PL2}.vtt`]),
    )
    expect(await f.db.select().from(lectures).where(eq(lectures.courseId, ID.LIB))).toHaveLength(2)
  })

  it('409s while a lecture is processing and deletes nothing', async () => {
    await f.exec(`UPDATE lectures SET status = 'processing' WHERE id = '${ID.PL2}'`)
    const removeObjects = remove()
    await expect(deleteCourse(ACTOR_A, ID.P, f.db, removeObjects)).rejects.toMatchObject({
      code: 'already_processing',
      status: 409,
    })
    expect(await courseRows()).toHaveLength(1)
    expect(await f.db.select().from(lectures).where(eq(lectures.courseId, ID.P))).toHaveLength(2)
    expect(removeObjects).not.toHaveBeenCalled()
  })

  it('404s library courses and other users’ courses', async () => {
    const removeObjects = remove()
    await expect(deleteCourse(ACTOR_A, ID.LIB, f.db, removeObjects)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(deleteCourse(ACTOR_B, ID.P, f.db, removeObjects)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(await courseRows()).toHaveLength(1)
    expect(removeObjects).not.toHaveBeenCalled()
  })

  it('finishes on retry after a lecture was already deleted', async () => {
    const removeObjects = remove()
    await f.exec(`DELETE FROM lectures WHERE id = '${ID.PL1}'`)
    await deleteCourse(ACTOR_A, ID.P, f.db, removeObjects)
    expect(await courseRows()).toEqual([])
  })
})
