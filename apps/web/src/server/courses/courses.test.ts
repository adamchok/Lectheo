import { beforeEach, describe, expect, it } from 'vitest'
import { createCourse } from './create'
import { getCourseMap } from './map'
import { listCourseSummaries } from './summary'
import {
  ACTOR_A,
  ACTOR_B,
  ACTOR_S,
  addAttempt,
  addMarker,
  createFixture,
  type Fixture,
  ID,
  SECRET_KEY_POINT,
} from './test-fixtures'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

const NEW_1 = '0190a000-0000-7000-8000-0000000a0001'
const NEW_2 = '0190a000-0000-7000-8000-0000000a0002'

describe('GET /courses', () => {
  it('lists library courses for everyone and personal courses only for the owner', async () => {
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C1,
      activityType: 'spot_flaw',
      outcome: 'incorrect',
    })
    const forA = await listCourseSummaries(f.db, ID.A)
    expect(forA.map((c) => c.id)).toEqual([ID.LIB, ID.P])
    expect(forA[0]).toMatchObject({
      kind: 'library',
      lectureCount: 2,
      mastery: { gray: 2, red: 1, amber: 0, green: 0 },
      attribution: {
        text: 'CS50x 2026 by Harvard University, CC BY-NC-SA 4.0. Adapted by Lectheo.',
        url: 'https://cs50.harvard.edu/x/license/',
      },
    })
    const forB = await listCourseSummaries(f.db, ID.B)
    expect(forB.map((c) => c.id)).toEqual([ID.LIB])
    expect(forB[0]?.mastery).toEqual({ gray: 3, red: 0, amber: 0, green: 0 })
  })
})

describe('POST /courses', () => {
  it('limits sample accounts to one personal course', async () => {
    const first = await createCourse(ACTOR_S, { id: NEW_1, title: 'Chem' }, f.db)
    expect(first).toMatchObject({ id: NEW_1, kind: 'personal', lectureCount: 0 })
    const second = createCourse(ACTOR_S, { id: NEW_2, title: 'Physics' }, f.db)
    await expect(second).rejects.toMatchObject({ code: 'sample_account_restricted', status: 403 })
  })

  it('replays the same id and hides other users’ ids', async () => {
    await createCourse(ACTOR_S, { id: NEW_1, title: 'Chem' }, f.db)
    const replay = await createCourse(ACTOR_S, { id: NEW_1, title: 'Other' }, f.db)
    expect(replay).toMatchObject({ id: NEW_1, title: 'Chem' })
    await expect(createCourse(ACTOR_B, { id: NEW_1, title: 'X' }, f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(createCourse(ACTOR_A, { id: ID.LIB, title: 'X' }, f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
  })

  it('lets Google accounts create several courses', async () => {
    await createCourse(ACTOR_A, { id: NEW_1, title: 'One' }, f.db)
    await createCourse(ACTOR_A, { id: NEW_2, title: 'Two' }, f.db)
    expect((await listCourseSummaries(f.db, ID.A)).length).toBe(4)
  })
})

describe('GET /courses/{id}/map', () => {
  it('returns nodes, edges, layout and only this user’s live markers', async () => {
    await addMarker(f, { lectureId: ID.L1, userId: ID.A, kind: 'lost', conceptId: ID.C2 })
    const unlinked = await addMarker(f, { lectureId: ID.L2, userId: ID.A, kind: 'important' })
    const deleted = await addMarker(f, { lectureId: ID.L1, userId: ID.A, conceptId: ID.C2 })
    await f.exec(`UPDATE markers SET deleted_at = now() WHERE id = '${deleted}'`)
    await addMarker(f, { lectureId: ID.L1, userId: ID.B, kind: 'lost', conceptId: ID.C2 })
    await addMarker(f, { lectureId: ID.L1, userId: ID.B, kind: 'lost' })

    const map = await getCourseMap(ACTOR_A, ID.LIB, f.db)
    expect(map.lectures.map((l) => l.id)).toEqual([ID.L1, ID.L2])
    // First lecture first, then by name.
    expect(map.nodes.map((n) => n.name)).toEqual(['Loops', 'Types', 'Arrays'])
    const c2 = map.nodes.find((n) => n.id === ID.C2)
    expect(c2?.lectureIds).toEqual([ID.L1, ID.L2])
    expect(c2?.markers).toEqual({ lost: 1, important: 0 })
    expect(c2?.moments).toEqual([
      { id: expect.any(String), lectureId: ID.L1, kind: 'lost', tMs: 1000 },
    ])
    // Library layout comes from the seed and is never recomputed at runtime.
    expect(map.nodes.find((n) => n.id === ID.C1)?.position).toEqual({ x: 10, y: 20 })
    expect(c2?.position).toBeNull()
    expect(map.edges).toEqual([{ id: ID.E1, from: ID.C3, to: ID.C1, relation: 'depends_on' }])
    expect(map.unlinkedMarkers).toEqual([
      { id: unlinked, lectureId: ID.L2, kind: 'important', tMs: 1000 },
    ])
    expect(map.course.kind).toBe('library')
  })

  it('gives each node its source moments with excerpts, capped at 3 (F2.4)', async () => {
    await f.exec(`
      INSERT INTO transcript_segments (lecture_id, idx, start_ms, end_ms, text) VALUES
        ('${ID.L1}', 0, 0, 1000, 'int and char'), ('${ID.L1}', 1, 61000, 62000, 'a while loop'),
        ('${ID.L1}', 2, 120000, 121000, 'two'), ('${ID.L1}', 3, 180000, 181000, 'three'),
        ('${ID.L2}', 0, 5000, 6000, 'loop over an array');
      UPDATE concept_occurrences SET segment_idxs = '{0,1,2,3}' WHERE concept_id = '${ID.C1}';
      UPDATE concept_occurrences SET salience = 2
        WHERE concept_id = '${ID.C2}' AND lecture_id = '${ID.L2}';
    `)
    const map = await getCourseMap(ACTOR_A, ID.LIB, f.db)
    const sourcesOf = (id: string) => map.nodes.find((n) => n.id === id)?.sources
    // Most salient occurrence first, across lectures.
    expect(sourcesOf(ID.C2)).toEqual([
      { lectureId: ID.L2, idx: 0, startMs: 5000, excerpt: 'loop over an array' },
      { lectureId: ID.L1, idx: 1, startMs: 61000, excerpt: 'a while loop' },
    ])
    expect(sourcesOf(ID.C1)?.map((s) => s.idx)).toEqual([0, 1, 2])
    // No segment row for an occurrence (L2 idx 1): no source.
    expect(sourcesOf(ID.C3)).toEqual([])
  })

  it('never contains 🔒 key points', async () => {
    const json = JSON.stringify(await getCourseMap(ACTOR_A, ID.LIB, f.db))
    expect(json).not.toContain('keyPoints')
    expect(json).not.toContain('key_points')
    expect(json).not.toContain(SECRET_KEY_POINT)
  })

  it('computes mastery on read', async () => {
    await addAttempt(f, {
      userId: ID.A,
      conceptId: ID.C3,
      activityType: 'diagnostic',
      confidence: 'sure',
      outcome: 'incorrect',
    })
    const map = await getCourseMap(ACTOR_A, ID.LIB, f.db)
    expect(map.nodes.find((n) => n.id === ID.C3)?.mastery).toMatchObject({
      state: 'red',
      confidentMistake: true,
    })
    const forB = await getCourseMap(ACTOR_B, ID.LIB, f.db)
    expect(forB.nodes.every((n) => n.mastery.state === 'gray')).toBe(true)
  })

  it('404s other users’ personal courses and bad ids; library is readable by all', async () => {
    await expect(getCourseMap(ACTOR_B, ID.P, f.db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getCourseMap(ACTOR_B, 'nope', f.db)).rejects.toMatchObject({ code: 'not_found' })
    expect((await getCourseMap(ACTOR_A, ID.P, f.db)).nodes).toHaveLength(2)
    expect((await getCourseMap(ACTOR_S, ID.LIB, f.db)).nodes).toHaveLength(3)
  })
})
