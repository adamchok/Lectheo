import { eq, lectures, llmCalls } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTOR_A,
  ACTOR_B,
  ACTOR_S,
  createFixture,
  type Fixture,
  ID,
} from '../courses/test-fixtures'
import { resetEnvCache } from '../env'
import { fakeYoutubeClient } from '../youtube'
import { createLecture, type CreateLectureInput } from './create'

vi.mock('server-only', () => ({}))

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

const lecturesUsed = async (userId: string): Promise<number> => {
  const result = (await f.exec(
    `SELECT count FROM usage_counters WHERE user_id = '${userId}' AND metric = 'lectures'`,
  )) as Array<{ rows: Array<{ count: number }> }>
  return result[0]?.rows[0]?.count ?? 0
}

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
    expect(await lecturesUsed(ID.A)).toBe(1)
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

  it('a double submit creates one lecture and counts quota once', async () => {
    const [a, b] = await Promise.all([
      createLecture(ACTOR_S, input({ courseId: SAMPLE_COURSE }), f.db),
      createLecture(ACTOR_S, input({ courseId: SAMPLE_COURSE }), f.db),
    ])
    expect(a.id).toBe(NEW)
    expect(b.id).toBe(NEW)
    expect(await lecturesUsed(ID.S)).toBe(1)
  })

  it('a 429 rolls the insert back, so nothing half-created is left', async () => {
    await createLecture(ACTOR_S, input({ courseId: SAMPLE_COURSE }), f.db)
    await expect(
      createLecture(ACTOR_S, input({ id: NEW2, courseId: SAMPLE_COURSE }), f.db),
    ).rejects.toMatchObject({ code: 'quota_exceeded' })
    expect(await f.db.select().from(lectures).where(eq(lectures.id, NEW2))).toHaveLength(0)
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
    await expect(createLecture(ACTOR_A, imp(NEW, 3 * 60 * MIN, ID.P), f.db)).rejects.toMatchObject({
      code: 'payload_too_large',
    })
    // Rejected before the quota is touched: the sample account can still add one.
    expect(await createLecture(ACTOR_S, imp(NEW, 19 * MIN), f.db)).toMatchObject({ id: NEW })
  })
})

describe('POST /lectures, source youtube (F10.2–F10.4)', () => {
  const yt = (over: Partial<CreateLectureInput> = {}): CreateLectureInput => ({
    id: NEW,
    courseId: ID.P,
    source: 'youtube',
    youtubeUrl: 'https://youtu.be/6Svu_ae5ebk?t=42',
    ...over,
  })
  const spend = (gatewayKey: string, costUsd: number) =>
    f.db.insert(llmCalls).values({
      task: 'transcribeChunk',
      role: 'transcriber',
      model: 'gemini-3.8-flash',
      promptVersion: 'transcribe-chunk@1',
      gatewayKey,
      costUsd,
      outcome: 'ok',
      // Older than an hour: this test is about the total, not the hourly cap.
      createdAt: new Date(Date.now() - 2 * 60 * MIN),
    })
  const create = (actor = ACTOR_A, over: Partial<CreateLectureInput> = {}) =>
    createLecture(actor, yt(over), f.db, new Date(), fakeYoutubeClient)

  it('stores only the video id and duration; the title defaults to the video title', async () => {
    const lecture = await create()
    expect(lecture).toMatchObject({
      source: 'youtube',
      status: 'draft',
      title: 'Test lecture 6Svu_ae5ebk',
      media: { youtubeId: '6Svu_ae5ebk', durationMs: 15 * MIN, localFileName: null },
    })
    const [row] = await f.db.select().from(lectures).where(eq(lectures.id, NEW))
    expect(row?.durationMs).toBe(15 * MIN)
    expect(JSON.stringify(row?.media)).not.toContain('youtu.be')
    expect(await lecturesUsed(ID.A)).toBe(1)
  })

  it('keeps a title the student typed', async () => {
    expect(await create(ACTOR_A, { title: 'Week 3 · Algorithms' })).toMatchObject({
      title: 'Week 3 · Algorithms',
    })
  })

  it.each([
    ['fakeMissing', 'not_found'],
    ['fakePrivate', 'private'],
    ['fakeLiveNow', 'live'],
    ['fakeNoEmbed', 'embed_disabled'],
    ['fakeAgeGate', 'age_restricted'],
    ['fakeTooShrt', 'too_short'],
    ['fakeFrench0', 'not_english'],
  ])('re-checks the video on the server: %s → 422 %s, nothing created', async (id, reason) => {
    await expect(create(ACTOR_A, { youtubeUrl: `https://youtu.be/${id}` })).rejects.toMatchObject({
      code: 'unprocessable_input',
      details: { reason },
    })
    expect(await f.db.select().from(lectures).where(eq(lectures.id, NEW))).toHaveLength(0)
    expect(await lecturesUsed(ID.A)).toBe(0)
  })

  it('refuses a video with a cached verdict (no speech) before any spend', async () => {
    await f.exec(`INSERT INTO youtube_transcripts (video_id, model, prompt_version, duration_ms,
      cues, refusal) VALUES ('6Svu_ae5ebk', 'fake', 'transcribe-chunk@2', 1, '[]'::jsonb,
      'no_speech')`)
    await expect(create()).rejects.toMatchObject({
      code: 'unprocessable_input',
      details: { reason: 'no_speech' },
    })
    expect(await lecturesUsed(ID.A)).toBe(0)
  })

  it('rate-limits YouTube creates (refusals use no quota): 10 per 10 minutes', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(
        create(ACTOR_A, { youtubeUrl: 'https://youtu.be/fakeNoEmbed' }),
      ).rejects.toMatchObject({ code: 'unprocessable_input' })
    }
    await expect(create()).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('404 while YouTube lectures are switched off (like `live`)', async () => {
    vi.stubEnv('FEATURE_YOUTUBE_LECTURES', '0')
    resetEnvCache()
    try {
      await expect(create()).rejects.toMatchObject({ code: 'not_found' })
    } finally {
      vi.unstubAllEnvs()
      resetEnvCache()
    }
  })

  it('422 for a link that is not a YouTube video', async () => {
    await expect(create(ACTOR_A, { youtubeUrl: 'https://vimeo.com/1' })).rejects.toMatchObject({
      code: 'unprocessable_input',
    })
  })

  it('sample accounts: up to 20 minutes (403 over), one lecture a day', async () => {
    const sample = (id: string, videoId: string) =>
      create(ACTOR_S, { id, courseId: SAMPLE_COURSE, youtubeUrl: `https://youtu.be/${videoId}` })
    await expect(sample(NEW, 'fakeLong45m')).rejects.toMatchObject({
      code: 'sample_account_restricted',
      status: 403,
    })
    await expect(sample(NEW, 'fakeTooLong')).rejects.toMatchObject({ code: 'payload_too_large' })
    expect(await sample(NEW, 'cs50Lectur3')).toMatchObject({ id: NEW })
    await expect(sample(NEW2, 'cs50Lectur4')).rejects.toMatchObject({ code: 'quota_exceeded' })
  })

  it('refuses new YouTube lectures with intake_paused at 75 % of the Google budget', async () => {
    // Default GOOGLE_AI_BUDGET_USD = 10. Prod gateway spend doesn't count toward it.
    await spend('prod', 50)
    await spend('google', 7.49)
    expect(await create()).toMatchObject({ id: NEW })
    await spend('google', 0.01)
    await expect(create(ACTOR_A, { id: NEW2 })).rejects.toMatchObject({
      code: 'intake_paused',
      status: 503,
    })
    // Other sources are unaffected.
    expect(await createLecture(ACTOR_A, input({ id: NEW2 }), f.db)).toMatchObject({ id: NEW2 })
  })
})
