import type { MarkerInput } from '@lectheo/contracts'
import { uuidv7 } from '@lectheo/db'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTOR_A,
  ACTOR_B,
  addMarker,
  createFixture,
  type Fixture,
  ID,
} from '../courses/test-fixtures'
import { getLecture } from './read'
import { deleteMarker, listMarkers, postMarkers } from './markers'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
  // L1: segment 0 = C1 (0–40 s), segment 1 = C2 (40–80 s).
  await f.exec(`
    INSERT INTO transcript_segments (lecture_id, idx, start_ms, end_ms, text) VALUES
      ('${ID.L1}', 0, 0, 40000, 'types'), ('${ID.L1}', 1, 40000, 80000, 'loops');
  `)
})

const marker = (kind: MarkerInput['kind'], tMs: number): MarkerInput => ({
  id: uuidv7(),
  kind,
  tMs,
  capture: 'watch',
})

describe('POST /lectures/{id}/markers', () => {
  it('is idempotent: a resent batch counts duplicates and inserts nothing twice', async () => {
    const batch = [marker('lost', 30_000), marker('important', 70_000)]
    expect(await postMarkers(ACTOR_A, ID.L1, batch, f.db)).toEqual({ accepted: 2, duplicates: 0 })
    const again = [...batch, marker('lost', 10_000)]
    expect(await postMarkers(ACTOR_A, ID.L1, again, f.db)).toEqual({ accepted: 1, duplicates: 2 })
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data).toHaveLength(3)
  })

  it('aligns markers to concepts on write for processed lectures', async () => {
    const lost = marker('lost', 30_000)
    const important = marker('important', 70_000)
    const anecdote = marker('lost', 600_000)
    await postMarkers(ACTOR_A, ID.L1, [lost, important, anecdote], f.db)
    const { data } = await listMarkers(ACTOR_A, ID.L1, f.db)
    expect(data).toEqual([
      {
        id: lost.id,
        kind: 'lost',
        tMs: 30_000,
        capture: 'watch',
        target: null,
        conceptIds: [ID.C1],
      },
      {
        id: important.id,
        kind: 'important',
        tMs: 70_000,
        capture: 'watch',
        target: null,
        conceptIds: [ID.C2],
      },
      {
        id: anecdote.id,
        kind: 'lost',
        tMs: 600_000,
        capture: 'watch',
        target: null,
        conceptIds: [],
      },
    ])
  })

  it('does not align before the lecture is processed', async () => {
    await f.exec(`UPDATE lectures SET status = 'processing' WHERE id = '${ID.L1}'`)
    await postMarkers(ACTOR_A, ID.L1, [marker('lost', 30_000)], f.db)
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data[0]?.conceptIds).toEqual([])
  })

  it('409s on a lecture without timestamps', async () => {
    await f.exec(`UPDATE lectures SET has_timestamps = false WHERE id = '${ID.PL2}'`)
    await expect(postMarkers(ACTOR_A, ID.PL2, [marker('lost', 1_000)], f.db)).rejects.toMatchObject(
      { code: 'invalid_state' },
    )
  })

  it('404s another user’s personal lecture', async () => {
    await expect(postMarkers(ACTOR_B, ID.PL1, [marker('lost', 1_000)], f.db)).rejects.toMatchObject(
      { code: 'not_found' },
    )
  })
})

describe('GET /lectures/{id}/markers', () => {
  it('returns only the caller’s markers on a shared library lecture', async () => {
    const mine = marker('lost', 30_000)
    await postMarkers(ACTOR_A, ID.L1, [mine], f.db)
    await addMarker(f, { lectureId: ID.L1, userId: ID.B, kind: 'important' })
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data.map((m) => m.id)).toEqual([mine.id])
    expect((await listMarkers(ACTOR_B, ID.L1, f.db)).data.map((m) => m.id)).not.toContain(mine.id)
  })

  it('a resent id owned by another user is a duplicate, never reassigned or revealed', async () => {
    const mine = marker('lost', 30_000)
    await postMarkers(ACTOR_A, ID.L1, [mine], f.db)
    expect(await postMarkers(ACTOR_B, ID.L1, [mine], f.db)).toEqual({ accepted: 0, duplicates: 1 })
    expect((await listMarkers(ACTOR_B, ID.L1, f.db)).data).toEqual([])
  })
})

describe('DELETE /lectures/{id}/markers/{markerId}', () => {
  it('soft-deletes (undo); repeat is a no-op; others’ markers are 404', async () => {
    const m = marker('lost', 30_000)
    await postMarkers(ACTOR_A, ID.L1, [m], f.db)
    await expect(deleteMarker(ACTOR_B, ID.L1, m.id, f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await deleteMarker(ACTOR_A, ID.L1, m.id, f.db)
    await deleteMarker(ACTOR_A, ID.L1, m.id, f.db)
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data).toEqual([])
    expect((await getLecture(ACTOR_A, ID.L1, f.db)).markerCounts).toEqual({ lost: 0, important: 0 })
    await expect(deleteMarker(ACTOR_A, ID.L1, 'nope', f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})
