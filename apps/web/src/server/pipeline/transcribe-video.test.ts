import { FAKE_SILENT_VIDEO_ID } from '@lectheo/ai'
import { llmCalls, uuidv7 } from '@lectheo/db'
import type { Cue, VideoChunk } from '@lectheo/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, createFixture, ID, type Fixture } from '../courses/test-fixtures'
import type { DbLike } from '../db'
import { claimLecture } from './claim'
import { rows } from './test-fixture'
import { NO_SPEECH_MESSAGE, transcribeVideoStep, type ChunkTranscriber } from './transcribe-video'
import { processLecture } from './workflow'

vi.mock('server-only', () => ({}))

// Steps called by the workflow resolve the database through appDb().
let current: DbLike
vi.mock('../db', async (orig) => ({
  ...(await orig<typeof import('../db')>()),
  appDb: () => current,
}))

const MIN = 60_000
const VIDEO = '6Svu_ae5ebk'
const TODAY = new Date().toISOString().slice(0, 10)

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
  current = f.db
})

/** A draft YouTube lecture of owner A (Google-tier limits) in course P. */
async function addYoutubeLecture(videoId = VIDEO, durationMs = 15 * MIN): Promise<string> {
  const id = uuidv7()
  await f.exec(`
    INSERT INTO lectures (id, course_id, title, seq, source, status, media, duration_ms)
      VALUES ('${id}', '${ID.P}', 'Lecture 3', 3, 'youtube', 'draft',
      '{"youtubeId":"${videoId}","durationMs":${durationMs}}'::jsonb, ${durationMs});
  `)
  return id
}

const setLecturesUsed = (count: number) =>
  f.exec(`INSERT INTO usage_counters (user_id, day, metric, count)
    VALUES ('${ID.A}', '${TODAY}', 'lectures', ${count})
    ON CONFLICT (user_id, day, metric) DO UPDATE SET count = ${count}`)
const lecturesUsed = async () =>
  (
    await rows<{ count: number }>(
      f,
      `SELECT count FROM usage_counters WHERE user_id = '${ID.A}' AND metric = 'lectures'`,
    )
  )[0]?.count
const segmentCount = async (lectureId: string) =>
  (
    await rows<{ n: number }>(
      f,
      `SELECT count(*)::int AS n FROM transcript_segments WHERE lecture_id = '${lectureId}'`,
    )
  )[0]?.n
const cacheRows = () =>
  rows<{ video_id: string; model: string; cues: Cue[] }>(
    f,
    'SELECT video_id, model, cues FROM youtube_transcripts',
  )

/** Speech every 10 s across a chunk (video timeline). */
const speech = (chunk: VideoChunk, text = 'And so a pointer stores the address of a value.') =>
  Array.from({ length: Math.floor((chunk.endMs - chunk.startMs) / 10_000) }, (_, i) => ({
    startMs: chunk.startMs + i * 10_000,
    endMs: chunk.startMs + i * 10_000 + 8_000,
    text,
  }))

describe('transcribeVideo: cache by video id (F10.6)', () => {
  it('miss: transcribes every chunk via the transcriber role, caches, writes segments', async () => {
    const lectureId = await addYoutubeLecture()
    expect(await transcribeVideoStep(f.db, lectureId)).toEqual({ cues: 60, cached: false })

    expect(await segmentCount(lectureId)).toBeGreaterThan(0)
    const [cache] = await cacheRows()
    expect(cache).toMatchObject({ video_id: VIDEO, model: 'fake' })
    expect(cache?.cues.at(-1)?.endMs).toBeLessThanOrEqual(15 * MIN)
    const [lecture] = await rows<{ has_timestamps: boolean; duration_ms: number }>(
      f,
      `SELECT has_timestamps, duration_ms FROM lectures WHERE id = '${lectureId}'`,
    )
    expect(lecture).toEqual({ has_timestamps: true, duration_ms: 15 * MIN })
  })

  it('miss: one llm_calls row per 2-minute chunk, paid by the Google key, owner billed', async () => {
    const lectureId = await addYoutubeLecture()
    await transcribeVideoStep(f.db, lectureId)
    const calls = await f.db.select().from(llmCalls)
    // 15 min → 0–2, 2–4, …, 12–14, 14–15: eight chunks.
    expect(calls).toHaveLength(8)
    for (const call of calls) {
      expect(call).toMatchObject({
        task: 'transcribeChunk',
        role: 'transcriber',
        gatewayKey: 'google',
        userId: ID.A,
        lectureId,
        outcome: 'ok',
      })
    }
  })

  it('hit: a second lecture of the same video reuses the transcript without AI calls', async () => {
    await transcribeVideoStep(f.db, await addYoutubeLecture())
    const callsBefore = (await f.db.select().from(llmCalls)).length
    const second = await addYoutubeLecture()
    const transcriber = vi.fn<ChunkTranscriber>()

    expect(await transcribeVideoStep(f.db, second, transcriber)).toEqual({ cues: 60, cached: true })
    expect(transcriber).not.toHaveBeenCalled()
    expect((await f.db.select().from(llmCalls)).length).toBe(callsBefore)
    expect(await segmentCount(second)).toBeGreaterThan(0)
    expect(await cacheRows()).toHaveLength(1)
  })

  it('a fake transcript never serves a real run (cache rows are per model)', async () => {
    await f.exec(`INSERT INTO youtube_transcripts (video_id, duration_ms, cues, model, prompt_version)
      VALUES ('${VIDEO}', ${15 * MIN}, '[]'::jsonb, 'gemini-3.8-flash', 'transcribe-chunk@1')`)
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => speech(chunk))
    const result = await transcribeVideoStep(f.db, await addYoutubeLecture(), transcriber)
    expect(result.cached).toBe(false)
    expect(transcriber).toHaveBeenCalled()
  })
})

describe('transcribeVideo: chunks, stitching and checks (F10.5)', () => {
  it('runs 2-minute chunks and retries an empty chunk between chunks with speech once', async () => {
    let emptyOnce = true
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => {
      if (chunk.startMs === 2 * MIN && emptyOnce) {
        emptyOnce = false
        return []
      }
      return speech(chunk)
    })
    const lectureId = await addYoutubeLecture(VIDEO, 6 * MIN)
    await transcribeVideoStep(f.db, lectureId, transcriber)
    expect(transcriber.mock.calls.map(([c]) => c.startMs / MIN)).toEqual([0, 2, 4, 2])
    expect((await cacheRows())[0]?.cues.some((c) => c.startMs === 2 * MIN)).toBe(true)
  })

  it('at most 10 chunks are in flight at once', async () => {
    let inFlight = 0
    let peak = 0
    const transcriber: ChunkTranscriber = async (chunk) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return speech(chunk)
    }
    await transcribeVideoStep(f.db, await addYoutubeLecture(VIDEO, 60 * MIN), transcriber)
    expect(peak).toBe(10)
  })

  it('a transcript with a large gap fails without caching (Retry transcribes again)', async () => {
    const transcriber: ChunkTranscriber = async (chunk) =>
      chunk.startMs === 0 || chunk.startMs >= 10 * MIN ? speech(chunk) : []
    const lectureId = await addYoutubeLecture(VIDEO, 15 * MIN)
    await expect(transcribeVideoStep(f.db, lectureId, transcriber)).rejects.toThrow(
      'transcript_incomplete',
    )
    expect(await cacheRows()).toHaveLength(0)
  })
})

describe('transcribeVideo: no speech refunds the lecture (F10.5)', () => {
  it('fails with the plain-words message and gives the day’s lecture back, once', async () => {
    await setLecturesUsed(3)
    const lectureId = await addYoutubeLecture(FAKE_SILENT_VIDEO_ID)

    await expect(transcribeVideoStep(f.db, lectureId)).rejects.toThrow(NO_SPEECH_MESSAGE)
    expect(await lecturesUsed()).toBe(2)
    const [step] = await rows<{ output: { error: { code: string }; refunded: boolean } }>(
      f,
      `SELECT output FROM pipeline_steps WHERE lecture_id = '${lectureId}'`,
    )
    expect(step?.output).toMatchObject({ error: { code: 'no_speech' }, refunded: true })

    // Retrying the failed step doesn't refund the same lecture twice.
    await expect(transcribeVideoStep(f.db, lectureId)).rejects.toThrow('no_speech')
    expect(await lecturesUsed()).toBe(2)
    expect(await cacheRows()).toHaveLength(0)
  })

  it('a transcript that is not English fails, refunded, even when the Data API said en', async () => {
    await setLecturesUsed(1)
    const transcriber: ChunkTranscriber = async (chunk) =>
      speech(chunk, 'Nous allons parler de la mémoire et des pointeurs dans ce cours.')
    await expect(
      transcribeVideoStep(f.db, await addYoutubeLecture(), transcriber),
    ).rejects.toThrow('not_english')
    expect(await lecturesUsed()).toBe(0)
  })
})

describe('transcribeVideo: the Google spend cap', () => {
  it('stops transcription at 100 % of GOOGLE_AI_BUDGET_USD without pausing other AI', async () => {
    await f.db.insert(llmCalls).values({
      task: 'transcribeChunk',
      role: 'transcriber',
      model: 'gemini-3.8-flash',
      promptVersion: 'transcribe-chunk@1',
      gatewayKey: 'google',
      costUsd: 10,
      outcome: 'ok',
    })
    await expect(transcribeVideoStep(f.db, await addYoutubeLecture())).rejects.toThrow(
      'intake_paused',
    )
    const blocked = await rows<{ outcome: string; gateway_key: string }>(
      f,
      `SELECT outcome, gateway_key FROM llm_calls WHERE outcome = 'budget_blocked'`,
    )
    expect(blocked.length).toBeGreaterThan(0)
    expect(blocked.every((r) => r.gateway_key === 'google')).toBe(true)
    const [flags] = await rows<{ ai_degraded: boolean; intake_paused: boolean }>(
      f,
      'SELECT ai_degraded, intake_paused FROM app_flags',
    )
    expect(flags).toEqual({ ai_degraded: false, intake_paused: false })
  })
})

describe('processLecture for a YouTube lecture', () => {
  it('transcribeVideo → the normal steps → ready', async () => {
    const lectureId = await addYoutubeLecture()
    await claimLecture(ACTOR_A, lectureId, undefined, f.db)
    expect(await processLecture(lectureId)).toBe('ready')
    const steps = await rows<{ step: string }>(
      f,
      `SELECT step FROM pipeline_steps WHERE lecture_id = '${lectureId}' ORDER BY step`,
    )
    expect(steps.map((s) => s.step)).toContain('transcribeVideo')
    expect(steps.map((s) => s.step)).not.toContain('parseTranscript')
  })

  it('re-runs can start from concept extraction but not from transcript parsing', async () => {
    const lectureId = await addYoutubeLecture()
    await claimLecture(ACTOR_A, lectureId, undefined, f.db)
    await processLecture(lectureId)
    await expect(claimLecture(ACTOR_A, lectureId, 'parseTranscript', f.db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    await expect(claimLecture(ACTOR_A, lectureId, 'extractConcepts', f.db)).resolves.toMatchObject(
      { reprocessCharged: true },
    )
  })
})
