import { FAKE_SILENT_VIDEO_ID, FatalTaskError, GoogleHttpError } from '@lectheo/ai'
import { llmCalls, uuidv7 } from '@lectheo/db'
import type { Cue, VideoChunk } from '@lectheo/domain'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, createFixture, ID, type Fixture } from '../courses/test-fixtures'
import type { DbLike } from '../db'
import { resetEnvCache } from '../env'
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

/** Calls the step as the workflow does, until `done` (or it throws). Returns the calls made. */
async function runToDone(lectureId: string, transcriber?: ChunkTranscriber): Promise<number> {
  for (let calls = 1; calls <= 20; calls++) {
    if ((await transcribeVideoStep(f.db, lectureId, transcriber)) === 'done') return calls
  }
  throw new Error('transcribeVideo never finished')
}

const googleSpend = (costUsd: number, createdAt = new Date()) =>
  f.db.insert(llmCalls).values({
    task: 'transcribeChunk',
    role: 'transcriber',
    model: 'gemini-3.8-flash',
    promptVersion: 'transcribe-chunk@2',
    gatewayKey: 'google',
    costUsd,
    outcome: 'ok',
    createdAt,
  })
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
interface CacheRow {
  video_id: string
  model: string
  prompt_version: string
  refusal: string | null
  cues: Cue[]
}
const cacheRows = () =>
  rows<CacheRow>(
    f,
    'SELECT video_id, model, prompt_version, refusal, cues FROM youtube_transcripts',
  )
const chunkCount = async () =>
  (await rows<{ n: number }>(f, 'SELECT count(*)::int AS n FROM youtube_transcript_chunks'))[0]?.n
const callCount = async () => (await f.db.select().from(llmCalls)).length

/** Speech every 10 s across a chunk (video timeline). */
const speech = (chunk: VideoChunk, text = 'And so a pointer stores the address of a value.') =>
  Array.from({ length: Math.floor((chunk.endMs - chunk.startMs) / 10_000) }, (_, i) => ({
    startMs: chunk.startMs + i * 10_000,
    endMs: chunk.startMs + i * 10_000 + 8_000,
    text,
  }))

describe('transcribeVideo: cache (F10.6)', () => {
  it('miss: chunks via the transcriber role, cached under model and prompt version', async () => {
    const lectureId = await addYoutubeLecture()
    expect(await runToDone(lectureId)).toBe(2) // one wave of 8 chunks, then stitch
    expect(await segmentCount(lectureId)).toBeGreaterThan(0)
    const [cache] = await cacheRows()
    expect(cache).toMatchObject({
      video_id: VIDEO,
      model: 'fake',
      prompt_version: 'transcribe-chunk@2',
      refusal: null,
    })
    expect(cache?.cues.at(-1)?.endMs).toBeLessThanOrEqual(15 * MIN)
    expect(await chunkCount()).toBe(0) // in-progress chunks go once the transcript is cached
  })

  it('miss: one llm_calls row per 2-minute chunk, paid by the Google key, owner billed', async () => {
    const lectureId = await addYoutubeLecture()
    await runToDone(lectureId)
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
    await runToDone(await addYoutubeLecture())
    const before = await callCount()
    const second = await addYoutubeLecture()
    const transcriber = vi.fn<ChunkTranscriber>()
    expect(await runToDone(second, transcriber)).toBe(1)
    expect(transcriber).not.toHaveBeenCalled()
    expect(await callCount()).toBe(before)
    expect(await segmentCount(second)).toBeGreaterThan(0)
  })

  it('a row from another model or prompt version is never served', async () => {
    await f.exec(`INSERT INTO youtube_transcripts (video_id, model, prompt_version, duration_ms, cues)
      VALUES ('${VIDEO}', 'fake', 'transcribe-chunk@1', ${15 * MIN}, '[]'::jsonb),
             ('${VIDEO}', 'gemini-3.8-flash', 'transcribe-chunk@2', ${15 * MIN}, '[]'::jsonb)`)
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => speech(chunk))
    await runToDone(await addYoutubeLecture(), transcriber)
    expect(transcriber).toHaveBeenCalled()
    expect(await cacheRows()).toHaveLength(3)
  })
})

describe('transcribeVideo: durable waves (F10.5)', () => {
  it('runs at most 10 chunks per call and stores each as it finishes', async () => {
    let inFlight = 0
    let peak = 0
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 2))
      inFlight -= 1
      return speech(chunk)
    })
    const lectureId = await addYoutubeLecture(VIDEO, 60 * MIN)
    expect(await transcribeVideoStep(f.db, lectureId, transcriber)).toBe('pending')
    expect(await chunkCount()).toBe(10)
    expect(await runToDone(lectureId, transcriber)).toBe(3) // 20 more chunks, then stitch
    expect(peak).toBe(10)
    expect(transcriber).toHaveBeenCalledTimes(30)
  })

  it('a transient failure leaves only that chunk for the next wave; finished ones stay', async () => {
    let failOnce = true
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => {
      if (chunk.startMs === 2 * MIN && failOnce) {
        failOnce = false
        throw new GoogleHttpError(503, 'high demand')
      }
      return speech(chunk)
    })
    const lectureId = await addYoutubeLecture(VIDEO, 6 * MIN)
    expect(await transcribeVideoStep(f.db, lectureId, transcriber)).toBe('pending')
    expect(await chunkCount()).toBe(2)
    await runToDone(lectureId, transcriber)
    expect(transcriber.mock.calls.map(([c]) => c.startMs / MIN)).toEqual([0, 2, 4, 2])
  })

  it('retries an empty chunk between chunks with speech once', async () => {
    let emptyOnce = true
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => {
      if (chunk.startMs === 2 * MIN && emptyOnce) {
        emptyOnce = false
        return []
      }
      return speech(chunk)
    })
    await runToDone(await addYoutubeLecture(VIDEO, 6 * MIN), transcriber)
    expect(transcriber.mock.calls.map(([c]) => c.startMs / MIN)).toEqual([0, 2, 4, 2])
    expect((await cacheRows())[0]?.cues.some((c) => c.startMs === 2 * MIN)).toBe(true)
  })

  it('a chunk whose output failed its checks twice counts as empty and is retried once', async () => {
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) => {
      if (chunk.startMs === 2 * MIN) throw new FatalTaskError('transcribeChunk', ['bad'])
      return speech(chunk)
    })
    await runToDone(await addYoutubeLecture(VIDEO, 6 * MIN), transcriber)
    expect(transcriber.mock.calls.filter(([c]) => c.startMs === 2 * MIN)).toHaveLength(2)
  })

  it('Google refusing the video (4xx) fails at once and aborts the rest of the wave', async () => {
    const signals: AbortSignal[] = []
    const transcriber: ChunkTranscriber = async (chunk, signal) => {
      signals.push(signal)
      if (chunk.startMs === 0) throw new GoogleHttpError(403, 'The caller does not have permission')
      await new Promise((resolve) => setTimeout(resolve, 20))
      return speech(chunk)
    }
    await expect(transcribeVideoStep(f.db, await addYoutubeLecture(), transcriber)).rejects.toThrow(
      'video_unavailable',
    )
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it('a long silence (empty chunks after the retry pass) is not a gap failure', async () => {
    const transcriber: ChunkTranscriber = async (chunk) =>
      chunk.startMs === 0 || chunk.startMs >= 26 * MIN ? speech(chunk) : []
    await runToDone(await addYoutubeLecture(VIDEO, 30 * MIN), transcriber)
    expect((await cacheRows())[0]?.refusal).toBeNull()
  })

  it('review N1: every chunk of an empty run between speech is retried before it counts', async () => {
    // Speech, then 6 empty chunks (2–14 min), then speech: a 12-minute hole.
    const transcriber = vi.fn<ChunkTranscriber>(async (chunk) =>
      chunk.startMs === 0 || chunk.startMs >= 14 * MIN ? speech(chunk) : [],
    )
    await runToDone(await addYoutubeLecture(VIDEO, 16 * MIN), transcriber)
    const calls = (startMin: number) =>
      transcriber.mock.calls.filter(([c]) => c.startMs === startMin * MIN).length
    expect([2, 4, 6, 8, 10, 12].map(calls)).toEqual([2, 2, 2, 2, 2, 2])
    // Retried and still empty: real silence, so the transcript is cached.
    expect((await cacheRows())[0]?.refusal).toBeNull()
  })

  it('review N1: a hole the retries fill is transcribed, not passed as silence', async () => {
    const tried = new Set<number>()
    const transcriber: ChunkTranscriber = async (chunk) => {
      const first = !tried.has(chunk.startMs)
      tried.add(chunk.startMs)
      // Chunks 2–14 min come back empty the first time only (a flaky Gemini answer).
      return first && chunk.startMs > 0 && chunk.startMs < 14 * MIN ? [] : speech(chunk)
    }
    await runToDone(await addYoutubeLecture(VIDEO, 16 * MIN), transcriber)
    const cues = (await cacheRows())[0]?.cues ?? []
    expect(cues.some((c) => c.startMs >= 6 * MIN && c.startMs < 8 * MIN)).toBe(true)
  })
})

describe('transcribeVideo: no speech, not English (F10.5)', () => {
  it('fails in plain words, refunds once and caches the verdict', async () => {
    await setLecturesUsed(3)
    const lectureId = await addYoutubeLecture(FAKE_SILENT_VIDEO_ID)

    await expect(runToDone(lectureId)).rejects.toThrow(NO_SPEECH_MESSAGE)
    expect(await lecturesUsed()).toBe(2)
    const [step] = await rows<{ output: { error: { code: string }; refunded: boolean } }>(
      f,
      `SELECT output FROM pipeline_steps WHERE lecture_id = '${lectureId}'`,
    )
    expect(step?.output).toMatchObject({ error: { code: 'no_speech' }, refunded: true })
    expect(await cacheRows()).toMatchObject([{ refusal: 'no_speech', cues: [] }])

    // Running the step again refunds nothing more and spends nothing: the verdict is cached.
    const before = await callCount()
    await expect(transcribeVideoStep(f.db, lectureId)).rejects.toThrow('no_speech')
    expect(await lecturesUsed()).toBe(2)
    expect(await callCount()).toBe(before)
  })

  it('refunds at most one lecture per student per day', async () => {
    await setLecturesUsed(3)
    const silence: ChunkTranscriber = async () => []
    await expect(runToDone(await addYoutubeLecture('silentVid01'), silence)).rejects.toThrow()
    await expect(runToDone(await addYoutubeLecture('silentVid02'), silence)).rejects.toThrow()
    expect(await lecturesUsed()).toBe(2)
  })

  it('a transcript that is not English fails, refunded, even when the Data API said en', async () => {
    await setLecturesUsed(1)
    const transcriber: ChunkTranscriber = async (chunk) =>
      speech(chunk, 'Nous allons parler de la mémoire et des pointeurs dans ce cours.')
    await expect(runToDone(await addYoutubeLecture(), transcriber)).rejects.toThrow('not_english')
    expect(await lecturesUsed()).toBe(0)
    expect((await cacheRows())[0]?.refusal).toBe('not_english')
  })
})

describe('transcribeVideo: the Google spend cap', () => {
  it('stops transcription at 100 % of GOOGLE_AI_BUDGET_USD without pausing other AI', async () => {
    await googleSpend(10)
    await expect(runToDone(await addYoutubeLecture())).rejects.toThrow('intake_paused')
    const blocked = await rows<{ gateway_key: string }>(
      f,
      `SELECT gateway_key FROM llm_calls WHERE outcome = 'budget_blocked'`,
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

describe('processLecture and Retry for a YouTube lecture', () => {
  it('transcribeVideo waves → the normal steps → ready', async () => {
    const lectureId = await addYoutubeLecture(VIDEO, 30 * MIN)
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
    await expect(claimLecture(ACTOR_A, lectureId, 'extractConcepts', f.db)).resolves.toMatchObject({
      reprocessCharged: true,
    })
  })

  it('a plain Retry is refused when the transcription failed for good', async () => {
    const lectureId = await addYoutubeLecture(FAKE_SILENT_VIDEO_ID)
    await claimLecture(ACTOR_A, lectureId, undefined, f.db)
    expect(await processLecture(lectureId)).toBe('failed')
    await expect(claimLecture(ACTOR_A, lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })

  it('review N2: ?from= is refused too after a final transcription failure', async () => {
    const lectureId = await addYoutubeLecture(FAKE_SILENT_VIDEO_ID)
    await claimLecture(ACTOR_A, lectureId, undefined, f.db)
    expect(await processLecture(lectureId)).toBe('failed')
    await expect(claimLecture(ACTOR_A, lectureId, 'extractConcepts', f.db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })

  it('review N6: with the F10 switch off, nothing transcribes, even an existing lecture', async () => {
    const lectureId = await addYoutubeLecture()
    vi.stubEnv('FEATURE_YOUTUBE_LECTURES', '0')
    resetEnvCache()
    try {
      await expect(claimLecture(ACTOR_A, lectureId, undefined, f.db)).rejects.toMatchObject({
        code: 'intake_paused',
      })
    } finally {
      vi.unstubAllEnvs()
      resetEnvCache()
    }
  })

  it('a Retry that would transcribe again obeys the Google cap', async () => {
    const lectureId = await addYoutubeLecture()
    await f.exec(`UPDATE lectures SET status = 'failed',
      error = '{"step":"transcribeVideo","code":"transcription_stalled","message":"x"}'::jsonb
      WHERE id = '${lectureId}'`)
    await googleSpend(7.5, new Date(Date.now() - 120 * MIN))
    await expect(claimLecture(ACTOR_A, lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'intake_paused',
    })
  })

  it('the hourly Google cap also pauses (25 % of the budget within an hour)', async () => {
    const lectureId = await addYoutubeLecture()
    await googleSpend(2.5)
    await expect(claimLecture(ACTOR_A, lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'intake_paused',
    })
  })
})
