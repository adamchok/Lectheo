import { eq, lectures } from '@lectheo/db'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACTOR_A,
  ACTOR_B,
  ACTOR_S,
  createFixture,
  type Fixture,
  ID,
} from '../courses/test-fixtures'
import { createLecture, type CreateLectureInput } from './create'

let f: Fixture
const NEW = '0190a000-0000-7000-8000-00000000a001'
const NEW2 = '0190a000-0000-7000-8000-00000000a002'
const SAMPLE_COURSE = '0190a000-0000-7000-8000-00000000a0c5'
const MIN = 60_000

const input = (over: Partial<CreateLectureInput> = {}): CreateLectureInput => ({
  id: NEW,
  courseId: ID.P,
  title: 'Week 3',
  source: 'transcript',
  ...over,
})

beforeEach(async () => {
  f = await createFixture()
  await f.exec(`INSERT INTO courses (id, kind, owner_id, title)
    VALUES ('${SAMPLE_COURSE}', 'personal', '${ID.S}', 'Sample course')`)
})

describe('POST /lectures', () => {
  it('creates a draft at the next seq and stores import media metadata', async () => {
    const lecture = await createLecture(
      ACTOR_A,
      input({ source: 'import', media: { localFileName: 'w3.mp4', durationMs: 50 * MIN } }),
      f.db,
    )
    expect(lecture).toMatchObject({
      id: NEW,
      seq: 3,
      status: 'draft',
      source: 'import',
      media: { localFileName: 'w3.mp4', durationMs: 50 * MIN, youtubeId: null },
      markerCounts: { lost: 0, important: 0 },
    })
  })

  it('replays the same id without consuming quota again', async () => {
    await createLecture(ACTOR_A, input(), f.db)
    const again = await createLecture(ACTOR_A, input({ title: 'ignored' }), f.db)
    expect(again).toMatchObject({ id: NEW, title: 'Week 3' })
    const rows = await f.db.select().from(lectures).where(eq(lectures.id, NEW))
    expect(rows).toHaveLength(1)
    const counter = (await f.exec(
      `SELECT count FROM usage_counters WHERE user_id = '${ID.A}' AND metric = 'lectures'`,
    )) as Array<{ rows: Array<{ count: number }> }>
    expect(counter[0]?.rows[0]?.count).toBe(1)
  })

  it('404s a replay of someone else’s id, a foreign course, library courses and live', async () => {
    await createLecture(ACTOR_A, input(), f.db)
    await expect(
      createLecture(ACTOR_B, input({ courseId: SAMPLE_COURSE }), f.db),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(createLecture(ACTOR_B, input({ id: NEW2 }), f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(
      createLecture(ACTOR_A, input({ id: NEW2, courseId: ID.LIB }), f.db),
    ).rejects.toMatchObject({ code: 'not_found' })
    await expect(
      createLecture(ACTOR_A, input({ id: NEW2, source: 'live' }), f.db),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('enforces the daily lectures quota with a reset time', async () => {
    const now = new Date('2026-10-04T12:00:00Z')
    await createLecture(ACTOR_S, input({ courseId: SAMPLE_COURSE }), f.db, now)
    await expect(
      createLecture(ACTOR_S, input({ id: NEW2, courseId: SAMPLE_COURSE }), f.db, now),
    ).rejects.toMatchObject({
      code: 'quota_exceeded',
      status: 429,
      details: { metric: 'lectures', limit: 1, resetAt: '2026-10-05T00:00:00.000Z' },
    })
  })

  it('limits sample imports to 20 min (403) and everyone to 2 h (413)', async () => {
    const imp = (id: string, durationMs: number, courseId = SAMPLE_COURSE) =>
      input({ id, courseId, source: 'import', media: { localFileName: 'x.mp4', durationMs } })
    await expect(createLecture(ACTOR_S, imp(NEW, 25 * MIN), f.db)).rejects.toMatchObject({
      code: 'sample_account_restricted',
      status: 403,
    })
    await expect(createLecture(ACTOR_S, imp(NEW, 3 * 60 * MIN), f.db)).rejects.toMatchObject({
      code: 'payload_too_large',
      status: 413,
    })
    await expect(
      createLecture(ACTOR_A, imp(NEW, 3 * 60 * MIN, ID.P), f.db),
    ).rejects.toMatchObject({ code: 'payload_too_large' })
    // Rejected before the quota is touched: the sample account can still add one.
    expect(await createLecture(ACTOR_S, imp(NEW, 19 * MIN), f.db)).toMatchObject({ id: NEW })
  })
})
