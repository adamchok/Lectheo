import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createActivity, getActivity } from './activities/service'
import type { Actor } from './auth'
import { createCourse } from './courses/create'
import { getCourseMap } from './courses/map'
import { getNextStep } from './courses/next'
import { listCourseSummaries } from './courses/summary'
import { ACTOR_A, ACTOR_G, ACTOR_S, createFixture, type Fixture, ID } from './courses/test-fixtures'
import { getResults } from './diagnostic/results'
import { getSession } from './diagnostic/session'
import { startDiagnostic } from './diagnostic/start'
import { getLecture, getTranscript } from './lectures/read'
import { listMarkers, postMarkers } from './lectures/markers'

vi.mock('server-only', () => ({}))

/*
 * F0.7: the CS50 library belongs to the sample experience. Google accounts get 404 on every
 * library route and never see it listed; sample and owner accounts read it as before.
 */

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

const NEW_1 = '0190a000-0000-7000-8000-0000000a0001'
const NEW_2 = '0190a000-0000-7000-8000-0000000a0002'
const NEW_LECTURE = '0190a000-0000-7000-8000-0000000a0011'
const ACTIVITY = '0190a000-0000-7000-8000-0000000a0021'
const SESSION = '0190a000-0000-7000-8000-0000000a0031'
const MARKER = '0190a000-0000-7000-8000-0000000a0041'

const notFound = { code: 'not_found', status: 404 }

describe('library access by account kind', () => {
  it('404s every library read for a Google account', async () => {
    const g = ACTOR_G
    const reads: Array<() => Promise<unknown>> = [
      () => getCourseMap(g, ID.LIB, f.db),
      () => getNextStep(g, ID.LIB, f.db),
      () => getLecture(g, ID.L1, f.db),
      () => getTranscript(g, ID.L1, {}, f.db),
      () => listMarkers(g, ID.L1, f.db),
      () =>
        postMarkers(g, ID.L1, [{ id: MARKER, kind: 'lost', tMs: 1000, capture: 'watch' }], f.db),
      () => startDiagnostic(g, ID.L1, f.db),
      () => createActivity(g, { id: ACTIVITY, conceptId: ID.C1, type: 'spot_flaw' }, f.db),
    ]
    for (const read of reads) await expect(read()).rejects.toMatchObject(notFound)
  })

  it('404s a Google account’s own leftover activity and session on library content', async () => {
    // Rows from before the fresh start (or crafted): owned, but on a library course.
    await f.exec(`
      INSERT INTO activities (id, user_id, concept_id, type) VALUES
        ('${ACTIVITY}', '${ID.G}', '${ID.C1}', 'teach_back');
      INSERT INTO diagnostic_sessions (id, user_id, lecture_id, planned_item_ids) VALUES
        ('${SESSION}', '${ID.G}', '${ID.L1}', '{}');
    `)
    await expect(getActivity(ACTOR_G, ACTIVITY, f.db)).rejects.toMatchObject(notFound)
    await expect(getSession(ACTOR_G, SESSION, f.db)).rejects.toMatchObject(notFound)
    await expect(getResults(ACTOR_G, SESSION, f.db)).rejects.toMatchObject(notFound)
  })

  it.each<[string, Actor]>([
    ['sample', ACTOR_S],
    ['owner', ACTOR_A],
  ])('lets a %s account read the library', async (_, actor) => {
    expect((await getCourseMap(actor, ID.LIB, f.db)).course.id).toBe(ID.LIB)
    expect((await getLecture(actor, ID.L1, f.db)).id).toBe(ID.L1)
    expect((await getNextStep(actor, ID.LIB, f.db)).kind).toBe('watch')
    expect((await listCourseSummaries(f.db, actor))[0]?.id).toBe(ID.LIB)
  })

  it('still lets a Google account read its own course', async () => {
    await createCourse(ACTOR_G, { id: NEW_1, title: 'Physics' }, f.db)
    expect((await getCourseMap(ACTOR_G, NEW_1, f.db)).course.id).toBe(NEW_1)
  })
})

describe('GET /courses for a Google account', () => {
  it('is empty on first run: no library', async () => {
    expect(await listCourseSummaries(f.db, ACTOR_G)).toEqual([])
  })

  it('lists own courses only, most recently active first', async () => {
    await f.exec(`
      INSERT INTO courses (id, kind, owner_id, title, created_at) VALUES
        ('${NEW_1}', 'personal', '${ID.G}', 'Older', now() - interval '2 days'),
        ('${NEW_2}', 'personal', '${ID.G}', 'Newer', now() - interval '1 day');
    `)
    const before = await listCourseSummaries(f.db, ACTOR_G)
    expect(before.map((c) => c.id)).toEqual([NEW_2, NEW_1])
    expect(before.every((c) => c.lastActiveAt !== null)).toBe(true)

    // A lecture added to (or just processed in) the older course makes it the latest.
    await f.exec(`
      INSERT INTO lectures (id, course_id, title, seq, source, status) VALUES
        ('${NEW_LECTURE}', '${NEW_1}', 'Week 1', 1, 'import', 'ready');
    `)
    expect((await listCourseSummaries(f.db, ACTOR_G)).map((c) => c.id)).toEqual([NEW_1, NEW_2])
  })

  it('reports lastActiveAt from the student’s own work only', async () => {
    const [library] = await listCourseSummaries(f.db, ACTOR_S)
    expect(library?.lastActiveAt).toBeNull()
    await f.exec(`
      INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture) VALUES
        ('${MARKER}', '${ID.L1}', '${ID.S}', 'lost', 1000, 'watch');
    `)
    const [after] = await listCourseSummaries(f.db, ACTOR_S)
    expect(after?.lastActiveAt).toEqual(expect.any(String))
    // Someone else's marks don't count.
    expect((await listCourseSummaries(f.db, ACTOR_A))[0]?.lastActiveAt).toBeNull()
  })
})
