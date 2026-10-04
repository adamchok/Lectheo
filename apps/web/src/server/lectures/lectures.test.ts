import { concepts, eq, inArray, lectures } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTOR_A,
  ACTOR_B,
  addMarker,
  createFixture,
  type Fixture,
  ID,
} from '../courses/test-fixtures'
import { getLecture, getTranscript } from './read'
import { deleteLecture, renameLecture, type RemoveObjects } from './write'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

describe('GET /lectures/{id}', () => {
  it('counts only this user’s live markers', async () => {
    await addMarker(f, { lectureId: ID.L1, userId: ID.A, kind: 'lost' })
    await addMarker(f, { lectureId: ID.L1, userId: ID.A, kind: 'important' })
    const gone = await addMarker(f, { lectureId: ID.L1, userId: ID.A, kind: 'lost' })
    await f.exec(`UPDATE markers SET deleted_at = now() WHERE id = '${gone}'`)
    await addMarker(f, { lectureId: ID.L1, userId: ID.B, kind: 'lost' })
    const lecture = await getLecture(ACTOR_A, ID.L1, f.db)
    expect(lecture).toMatchObject({
      id: ID.L1,
      courseId: ID.LIB,
      source: 'library',
      status: 'ready',
      markerCounts: { lost: 1, important: 1 },
      progress: null,
      media: null,
      error: null,
    })
    expect(JSON.stringify(lecture)).not.toContain('audioPath')
  })

  it('404s another user’s personal lecture', async () => {
    await expect(getLecture(ACTOR_B, ID.PL1, f.db)).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('GET /lectures/{id}/transcript', () => {
  it('returns overlapping segments with edits applied', async () => {
    await f.exec(`
      INSERT INTO transcript_segments (lecture_id, idx, start_ms, end_ms, text, edited_text)
      VALUES ('${ID.L1}', 0, 0, 1000, 'zero', NULL),
             ('${ID.L1}', 1, 1000, 2000, 'one', 'ONE'),
             ('${ID.L1}', 2, 2000, 3000, 'two', NULL);
    `)
    const all = await getTranscript(ACTOR_B, ID.L1, {}, f.db)
    expect(all.segments).toHaveLength(3)
    const range = await getTranscript(ACTOR_B, ID.L1, { fromMs: 1500, toMs: 2000 }, f.db)
    expect(range.segments).toEqual([
      { idx: 1, startMs: 1000, endMs: 2000, text: 'ONE', edited: true },
    ])
    await expect(getTranscript(ACTOR_B, ID.PL1, {}, f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('PATCH /lectures/{id}', () => {
  it('renames own lectures; library and other users’ lectures are 404', async () => {
    expect((await renameLecture(ACTOR_A, ID.PL1, 'Week one', f.db)).title).toBe('Week one')
    await expect(renameLecture(ACTOR_A, ID.L1, 'x', f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(renameLecture(ACTOR_B, ID.PL1, 'x', f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('DELETE /lectures/{id}', () => {
  const conceptIds = async () =>
    (
      await f.db
        .select({ id: concepts.id })
        .from(concepts)
        .where(inArray(concepts.id, [ID.PC1, ID.PC2]))
    )
      .map((c) => c.id)
      .sort()

  it('deletes the lecture and orphaned concepts, keeps shared ones, cleans Storage', async () => {
    const remove = vi.fn<RemoveObjects>(async () => undefined)
    await deleteLecture(ACTOR_A, ID.PL1, f.db, remove)
    expect(await f.db.select().from(lectures).where(eq(lectures.id, ID.PL1))).toEqual([])
    expect(await conceptIds()).toEqual([ID.PC2])
    expect(remove).toHaveBeenCalledWith('audio', [`${ID.A}/${ID.PL1}`])
    expect(remove).toHaveBeenCalledWith(
      'transcripts',
      expect.arrayContaining([`${ID.A}/${ID.PL1}.vtt`, `${ID.A}/${ID.PL1}.txt`]),
    )
  })

  it('still succeeds when Storage cleanup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const remove = vi.fn<RemoveObjects>(async () => {
      throw new Error('storage down')
    })
    await expect(deleteLecture(ACTOR_A, ID.PL2, f.db, remove)).resolves.toBeUndefined()
    expect(await conceptIds()).toEqual([ID.PC1, ID.PC2])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('409s a lecture that is still processing and keeps it', async () => {
    const remove = vi.fn<RemoveObjects>(async () => undefined)
    for (const status of ['processing', 'map_ready']) {
      await f.exec(`UPDATE lectures SET status = '${status}' WHERE id = '${ID.PL1}'`)
      await expect(deleteLecture(ACTOR_A, ID.PL1, f.db, remove)).rejects.toMatchObject({
        code: 'invalid_state',
        status: 409,
      })
    }
    expect(await f.db.select().from(lectures).where(eq(lectures.id, ID.PL1))).toHaveLength(1)
    expect(await conceptIds()).toEqual([ID.PC1, ID.PC2])
    expect(remove).not.toHaveBeenCalled()
  })

  it('404s library lectures and other users’ lectures', async () => {
    const remove = vi.fn<RemoveObjects>(async () => undefined)
    await expect(deleteLecture(ACTOR_A, ID.L1, f.db, remove)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(deleteLecture(ACTOR_B, ID.PL1, f.db, remove)).rejects.toMatchObject({
      code: 'not_found',
    })
    expect(remove).not.toHaveBeenCalled()
  })
})
