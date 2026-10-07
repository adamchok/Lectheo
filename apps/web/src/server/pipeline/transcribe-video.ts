import { FAKE_MODEL, GOOGLE_DIRECT, runTask, transcribeChunkTask } from '@lectheo/ai'
import { youtubeRefusalMessage } from '@lectheo/contracts'
import { and, eq, youtubeTranscripts } from '@lectheo/db'
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
import { isAiFake } from '../env'
import { MEDIA_LIMITS, refundUsage } from '../quota'
import { capToTier, loadLecture, replaceSegments, type PipelineLecture } from './segments'
import { mergeStepOutput, PipelineError, runStep, stepOutput } from './state'

/*
 * transcribeVideo (F10.5–F10.6, Architecture §4.3 mode F): YouTube lectures get their transcript
 * from Gemini on the direct Google API (ADR-017). Cache by video id first; otherwise 2-minute
 * chunks run in parallel (at most 10 at a time), bad chunks are retried once, the chunks are
 * stitched with the spike's rule, and the result is checked before it is cached and segmented.
 */

const CONCURRENCY = 10
const MINUTE_MS = 60_000
export const NO_SPEECH_MESSAGE = 'We couldn’t find speech in this video.'

/** Transcribes one chunk into video-timeline ms cues. */
export type ChunkTranscriber = (chunk: VideoChunk) => Promise<Cue[]>

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
  return async (chunk) => {
    const { output } = await runTask(transcribeChunkTask, { videoId, ...chunk }, ctx)
    return stampCues(output.cues, chunk)
  }
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep the input order. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Every chunk in parallel (capped), one retry for each bad chunk, then the stitching rule. */
export async function transcribeChunks(
  durationMs: number,
  transcribe: ChunkTranscriber,
): Promise<Cue[]> {
  const chunks = chunkPlan(durationMs)
  const first = await mapLimit(chunks, CONCURRENCY, transcribe)
  const parts = chunks.map((chunk, i) => ({ chunk, cues: first[i] ?? [] }))
  const retry = chunksToRetry(parts)
  const second = await mapLimit(retry, CONCURRENCY, (i) => transcribe(chunks[i] as VideoChunk))
  const retried = new Map(retry.map((idx, k) => [idx, second[k] ?? []]))
  return stitchChunks(parts.map((p, i) => ({ chunk: p.chunk, cues: retried.get(i) ?? p.cues })))
}

async function readCache(db: DbLike, videoId: string, model: string): Promise<Cue[] | null> {
  const [row] = await db
    .select({ cues: youtubeTranscripts.cues })
    .from(youtubeTranscripts)
    .where(and(eq(youtubeTranscripts.videoId, videoId), eq(youtubeTranscripts.model, model)))
    .limit(1)
  return row?.cues ?? null
}

/** F10.5: a video that yields no usable transcript gives the day's lecture back (once). */
async function refundOnce(db: DbLike, lecture: PipelineLecture): Promise<void> {
  const { refunded } = await stepOutput<{ refunded: boolean }>(db, lecture.id, 'transcribeVideo')
  if (refunded) return
  await refundUsage(db, lecture.ownerId, 'lectures', lecture.createdAt)
  await mergeStepOutput(db, lecture.id, 'transcribeVideo', { refunded: true })
}

/** Fresh cues → checked, English, non-empty; throws a PipelineError otherwise. */
async function assertUsable(
  db: DbLike,
  lecture: PipelineLecture,
  cues: readonly Cue[],
  durationMs: number,
): Promise<void> {
  if (cues.length === 0) {
    await refundOnce(db, lecture)
    throw new PipelineError('no_speech', NO_SPEECH_MESSAGE)
  }
  const problems = checkVideoCues(cues, durationMs)
  if (problems.length > 0) {
    const event = { event: 'video_transcript_invalid', lectureId: lecture.id, problems }
    console.warn(JSON.stringify(event))
    throw new PipelineError(
      'transcript_incomplete',
      'We couldn’t transcribe this video reliably. Retry in a minute.',
    )
  }
  if (!looksEnglish(cues.map((c) => c.text).join(' '))) {
    await refundOnce(db, lecture)
    const maxMinutes = MEDIA_LIMITS[lecture.tier].maxDurationMs / MINUTE_MS
    throw new PipelineError('not_english', youtubeRefusalMessage('not_english', maxMinutes))
  }
}

export async function transcribeVideoStep(
  db: DbLike,
  lectureId: string,
  transcriber?: ChunkTranscriber,
): Promise<{ cues: number; cached: boolean }> {
  return runStep(db, lectureId, 'transcribeVideo', async () => {
    const lecture = await loadLecture(db, lectureId)
    const videoId = lecture.media?.youtubeId
    const durationMs = lecture.media?.durationMs ?? lecture.durationMs
    if (!videoId || !durationMs) {
      throw new PipelineError('no_video', 'This lecture has no YouTube video. Add it again.')
    }
    // Fake transcripts never stand in for real ones (local dev shares the database).
    const model = isAiFake() ? FAKE_MODEL : GOOGLE_DIRECT.model
    const tierMaxMs = MEDIA_LIMITS[lecture.tier].maxDurationMs
    const spanMs = Math.min(durationMs, tierMaxMs)

    const cached = await readCache(db, videoId, model)
    const cues =
      cached ??
      (await transcribeChunks(spanMs, transcriber ?? geminiTranscriber(db, lecture, videoId)))
    if (!cached) {
      await assertUsable(db, lecture, cues, durationMs)
      // Only a whole video is shared; a tier-capped transcript would be short for others.
      if (spanMs === durationMs) {
        const promptVersion = transcribeChunkTask.promptVersion
        await db
          .insert(youtubeTranscripts)
          .values({ videoId, durationMs, cues, model, promptVersion })
          .onConflictDoNothing()
      }
    }
    const segments = capToTier(segmentCues(cues, { hasTimestamps: true }), lecture.tier)
    await replaceSegments(db, lectureId, segments, { hasTimestamps: true, durationMs: spanMs })
    return { cues: cues.length, cached: cached !== null }
  })
}
