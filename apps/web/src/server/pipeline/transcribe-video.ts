import {
  AiPausedError,
  FatalTaskError,
  GoogleHttpError,
  runTask,
  transcribeChunkTask,
} from '@lectheo/ai'
import { youtubeRefusalMessage } from '@lectheo/contracts'
import {
  checkVideoCues,
  chunkPlan,
  chunksToRetry,
  looksEnglish,
  segmentCues,
  stampCues,
  stitchChunks,
  type Cue,
  type VideoChunk,
} from '@lectheo/domain'
import { aiContext } from '../ai-hooks'
import type { DbLike } from '../db'
import { ApiError } from '../errors'
import { MEDIA_LIMITS, MINUTE_MS, refundUsage } from '../quota'
import { takeRateLimit, YOUTUBE_REFUND_LIMIT } from '../rate-limit'
import {
  deleteChunks,
  readCachedTranscript,
  readChunks,
  saveCachedTranscript,
  saveChunk,
  storedChunk,
  transcriberKey,
  type TranscriberKey,
  type TranscriptRefusal,
} from '../youtube-cache'
import { capToTier, loadLecture, replaceSegments, type PipelineLecture } from './segments'
import { mergeStepOutput, PipelineError, runStep, stepOutput } from './state'

/*
 * transcribeVideo (F10.5–F10.6, Architecture §4.3 mode F): YouTube lectures get their transcript
 * from Gemini on the direct Google API (ADR-017). Cache first; otherwise each call of the step
 * runs one wave of at most 10 two-minute chunks and stores every chunk as it finishes, so a step
 * that dies (or a Retry) never pays for finished chunks again. The workflow calls it until it
 * says `done`: missing chunks first, then one retry of each bad chunk, then the spike's stitch,
 * the checks, the cache and the segments.
 */

/** Chunks per wave: the concurrency cap (F10.5). */
const WAVE = 10
/** A wave stops here (in-flight chunks are aborted and redone next wave): under the 300 s limit. */
const STEP_DEADLINE_MS = 240_000
export const NO_SPEECH_MESSAGE = 'We couldn’t find speech in this video.'
const INCOMPLETE_MESSAGE =
  'We couldn’t transcribe this video reliably. Try another video, or upload its transcript instead.'
const UNAVAILABLE_MESSAGE =
  'Google couldn’t open this video. It may have been made private or removed.'

export type VideoProgress = 'pending' | 'done'

/** Transcribes one chunk into video-timeline ms cues; stops when `signal` aborts. */
export type ChunkTranscriber = (chunk: VideoChunk, signal: AbortSignal) => Promise<Cue[]>

/** The real transcriber: runTask → transcriber role → direct Google API, one llm_calls row. */
export function geminiTranscriber(
  db: DbLike,
  lecture: PipelineLecture,
  videoId: string,
): ChunkTranscriber {
  const ctx = aiContext({
    userId: lecture.ownerId,
    lectureId: lecture.id,
    skipQuota: true, // the lecture already counted against `lectures`
    google: true,
    db,
  })
  return async (chunk, signal) => {
    const { output } = await runTask(
      transcribeChunkTask,
      { videoId, ...chunk },
      { ...ctx, abortSignal: signal },
    )
    return stampCues(output.cues, chunk)
  }
}

/** Google refused the video itself (made private, removed…): any 4xx but a rate limit. */
const videoRejected = (err: unknown): boolean =>
  err instanceof GoogleHttpError &&
  err.statusCode >= 400 &&
  err.statusCode < 500 &&
  err.statusCode !== 429

/** Errors that end the lecture at once (and stop the rest of the wave). */
const isFatal = (err: unknown): boolean =>
  err instanceof PipelineError || err instanceof ApiError || err instanceof AiPausedError

/**
 * Transcribes `chunks` in parallel and stores each as it finishes (`attempts` = 1, or 2 for the
 * retry). A chunk whose output failed its checks twice is stored empty (the retry rule then sees
 * it); a transient failure or the deadline leaves it for the next wave. A fatal error stops the
 * other chunks and is thrown.
 */
async function runWave(
  db: DbLike,
  key: TranscriberKey,
  chunks: readonly VideoChunk[],
  attempts: number,
  transcribe: ChunkTranscriber,
): Promise<void> {
  const stop = new AbortController()
  const signal = AbortSignal.any([stop.signal, AbortSignal.timeout(STEP_DEADLINE_MS)])
  let fatal: unknown = null
  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        await saveChunk(db, key, chunk, await transcribe(chunk, signal), attempts)
      } catch (err) {
        if (fatal !== null) return
        if (videoRejected(err)) fatal = new PipelineError('video_unavailable', UNAVAILABLE_MESSAGE)
        else if (isFatal(err)) fatal = err
        else if (err instanceof FatalTaskError) await saveChunk(db, key, chunk, [], attempts)
        else if (!signal.aborted) {
          const reason = err instanceof Error ? err.message : String(err)
          console.warn(JSON.stringify({ event: 'video_chunk_failed', chunk, reason }))
        }
        if (fatal !== null) stop.abort()
      }
    }),
  )
  if (fatal !== null) throw fatal
}

/**
 * F10.5: a video that yields no usable transcript gives the lecture back, once per lecture and
 * at most once per student per day (review: so a refund can't fund another try for free).
 */
async function refundOnce(db: DbLike, lecture: PipelineLecture): Promise<void> {
  const { refunded } = await stepOutput<{ refunded: boolean }>(db, lecture.id, 'transcribeVideo')
  if (refunded) return
  if (await takeRateLimit(db, `youtube-refund:${lecture.ownerId}`, YOUTUBE_REFUND_LIMIT)) {
    await refundUsage(db, lecture.ownerId, 'lectures', lecture.createdAt)
  }
  await mergeStepOutput(db, lecture.id, 'transcribeVideo', { refunded: true })
}

/** Refunds, caches the verdict (so the video is refused before any spend next time) and fails. */
async function refuse(
  db: DbLike,
  lecture: PipelineLecture,
  key: TranscriberKey,
  durationMs: number,
  refusal: TranscriptRefusal,
): Promise<never> {
  await refundOnce(db, lecture)
  await saveCachedTranscript(db, key, durationMs, { kind: 'refusal', refusal })
  const maxMinutes = MEDIA_LIMITS[lecture.tier].maxDurationMs / MINUTE_MS
  const message =
    refusal === 'no_speech' ? NO_SPEECH_MESSAGE : youtubeRefusalMessage(refusal, maxMinutes)
  throw new PipelineError(refusal, message)
}

async function writeSegments(
  db: DbLike,
  lecture: PipelineLecture,
  cues: readonly Cue[],
  spanMs: number,
): Promise<void> {
  const segments = capToTier(segmentCues(cues, { hasTimestamps: true }), lecture.tier)
  await replaceSegments(db, lecture.id, segments, { hasTimestamps: true, durationMs: spanMs })
}

/** One call of the step: the cache, else one wave, else stitch → check → cache → segments. */
async function advance(
  db: DbLike,
  lecture: PipelineLecture,
  transcriber: ChunkTranscriber | undefined,
): Promise<VideoProgress> {
  const videoId = lecture.media?.youtubeId
  const durationMs = lecture.media?.durationMs ?? lecture.durationMs
  if (!videoId || !durationMs) {
    throw new PipelineError('no_video', 'This lecture has no YouTube video. Add it again.')
  }
  const key = transcriberKey(videoId)
  const spanMs = Math.min(durationMs, MEDIA_LIMITS[lecture.tier].maxDurationMs)
  const cached = await readCachedTranscript(db, key)
  if (cached?.kind === 'refusal') return refuse(db, lecture, key, durationMs, cached.refusal)
  if (cached) {
    await writeSegments(db, lecture, cached.cues, spanMs)
    return 'done'
  }

  const transcribe = transcriber ?? geminiTranscriber(db, lecture, videoId)
  const chunks = chunkPlan(spanMs)
  const stored = await readChunks(db, key)
  const missing = chunks.filter((c) => !storedChunk(stored, c))
  if (missing.length > 0) {
    await runWave(db, key, missing.slice(0, WAVE), 1, transcribe)
    return 'pending'
  }
  const parts = chunks.map((chunk) => ({ chunk, cues: storedChunk(stored, chunk)?.cues ?? [] }))
  const attemptsOf = (c: VideoChunk): number => storedChunk(stored, c)?.attempts ?? 1
  const retry = chunksToRetry(parts)
    .map((i) => chunks[i] as VideoChunk)
    .filter((c) => attemptsOf(c) < 2)
  if (retry.length > 0) {
    await runWave(db, key, retry.slice(0, WAVE), 2, transcribe)
    return 'pending'
  }

  const cues = stitchChunks(parts)
  if (cues.length === 0) return refuse(db, lecture, key, durationMs, 'no_speech')
  // Chunks still empty after the retry pass are real silence (an exam, a demo): those next to
  // speech were retried and stayed empty, the rest sit between empty chunks.
  const silent = parts.filter((p) => p.cues.length === 0).map((p) => p.chunk)
  const problems = checkVideoCues(cues, durationMs, silent)
  if (problems.length > 0) {
    console.warn(
      JSON.stringify({ event: 'video_transcript_invalid', lectureId: lecture.id, problems }),
    )
    await deleteChunks(db, key)
    throw new PipelineError('transcript_incomplete', INCOMPLETE_MESSAGE)
  }
  if (!looksEnglish(cues.map((c) => c.text).join(' '))) {
    return refuse(db, lecture, key, durationMs, 'not_english')
  }
  // Only a whole video is shared; a tier-capped transcript would be short for others.
  if (spanMs === durationMs) {
    await saveCachedTranscript(db, key, durationMs, { kind: 'transcript', cues })
  } else {
    await deleteChunks(db, key)
  }
  await writeSegments(db, lecture, cues, spanMs)
  return 'done'
}

/** The workflow calls this until it returns `done` (each call is one bounded wave). */
export async function transcribeVideoStep(
  db: DbLike,
  lectureId: string,
  transcriber?: ChunkTranscriber,
): Promise<VideoProgress> {
  return runStep(
    db,
    lectureId,
    'transcribeVideo',
    async () => advance(db, await loadLecture(db, lectureId), transcriber),
    { isDone: (progress) => progress === 'done' },
  )
}
