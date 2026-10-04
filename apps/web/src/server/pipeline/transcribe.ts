import { and, eq, isNull, lectures } from '@lectheo/db'
import { parseTranscript, segmentCues } from '@lectheo/domain'
import type { DbLike } from '../db'
import { MEDIA_LIMITS } from '../quota'
import { BUCKETS, createDownloadUrl, deleteObjects } from '../storage'
import type { SttClient } from '../stt/assemblyai'
import { supabaseAdmin } from '../supabase'
import { capToTier, hasSegments, loadLecture, replaceSegments } from './segments'
import { mergeStepOutput, PipelineError, runStep, stepOutput } from './state'

/*
 * Transcript steps (Architecture §4.3, ADR-004). Transcript sources arrive with segments already
 * written by capture-import, so parseTranscript is a no-op unless ?from=parseTranscript asked for
 * a re-parse of the stored raw file. Audio sources are transcribed by AssemblyAI (polled).
 */

/** Written to lectures.stt_job_id before submitting, so a retry never submits twice. */
const RESERVATION_PREFIX = 'reserving:'
/** A reservation older than this belongs to a crashed attempt and may be taken over. */
const RESERVATION_STALE_MS = 5 * 60_000
const TRANSCRIPT_FILE = /\.(vtt|srt|txt|docx)$/

/** Raw transcript text from Storage (`transcripts/{ownerId}/{lectureId}.*`), or null. */
async function downloadTranscript(ownerId: string, lectureId: string): Promise<string | null> {
  const bucket = supabaseAdmin().storage.from(BUCKETS.transcripts)
  const { data: files, error } = await bucket.list(ownerId, { search: lectureId })
  if (error) throw error
  const file = files?.find((f) => f.name.startsWith(lectureId) && TRANSCRIPT_FILE.test(f.name))
  if (!file) return null
  if (file.name.endsWith('.docx')) {
    throw new PipelineError(
      'unprocessable_input',
      'Word transcripts are not supported yet. Upload a .vtt, .srt or .txt file instead.',
    )
  }
  const { data, error: downloadError } = await bucket.download(`${ownerId}/${file.name}`)
  if (downloadError || !data)
    throw downloadError ?? new Error('transcript download returned no data')
  return data.text()
}

export async function parseTranscriptStep(
  db: DbLike,
  lectureId: string,
): Promise<{ segments: number | 'existing' }> {
  return runStep(db, lectureId, 'parseTranscript', async () => {
    const { reparse } = await stepOutput<{ reparse: boolean }>(db, lectureId, 'parseTranscript')
    if (!reparse && (await hasSegments(db, lectureId))) return { segments: 'existing' as const }

    const lecture = await loadLecture(db, lectureId)
    const raw = await downloadTranscript(lecture.ownerId, lectureId)
    if (raw === null) {
      throw new PipelineError(
        'no_transcript',
        'We couldn’t find a transcript for this lecture. Upload one and try again.',
      )
    }
    const parsed = parseTranscript(raw)
    const segments = capToTier(
      segmentCues(parsed.cues, { hasTimestamps: parsed.hasTimestamps }),
      lecture.tier,
    )
    if (segments.length === 0) {
      throw new PipelineError('unprocessable_input', 'This transcript has no readable text.')
    }
    await replaceSegments(db, lectureId, segments, {
      hasTimestamps: parsed.hasTimestamps,
      durationMs: parsed.hasTimestamps ? (segments.at(-1)?.endMs ?? null) : null,
    })
    return { segments: segments.length }
  })
}

const reservationAge = (jobId: string): number =>
  Date.now() - Number(jobId.slice(RESERVATION_PREFIX.length))

/**
 * Reserves stt_job_id with a guarded update, then submits. A finished submit is reused; a fresh
 * reservation by another attempt makes this one retry later; a failed submit releases it.
 * ponytail: a crash between submit and the id write leaves a stale reservation, and the takeover
 * may submit a second (orphaned, billed) job. Rare; the stale window keeps it from racing.
 */
export async function submitTranscriptionStep(
  db: DbLike,
  lectureId: string,
  stt: SttClient,
): Promise<{ jobId: string }> {
  return runStep(db, lectureId, 'submitTranscription', async () => {
    const lecture = await loadLecture(db, lectureId)
    const current = lecture.sttJobId
    if (current && !current.startsWith(RESERVATION_PREFIX)) return { jobId: current }
    if (current && reservationAge(current) < RESERVATION_STALE_MS) {
      throw new Error('transcription submit already in progress')
    }
    if (!lecture.audioPath) {
      throw new PipelineError(
        'no_audio',
        'The audio upload is missing. Upload the recording again.',
      )
    }

    const token = `${RESERVATION_PREFIX}${Date.now()}`
    const [won] = await db
      .update(lectures)
      .set({ sttJobId: token })
      .where(
        and(
          eq(lectures.id, lectureId),
          current ? eq(lectures.sttJobId, current) : isNull(lectures.sttJobId),
        ),
      )
      .returning({ id: lectures.id })
    if (!won) throw new Error('transcription submit raced another attempt')

    const release = (value: string | null) =>
      db
        .update(lectures)
        .set({ sttJobId: value })
        .where(and(eq(lectures.id, lectureId), eq(lectures.sttJobId, token)))
    try {
      const audioUrl = await createDownloadUrl(BUCKETS.audio, lecture.audioPath)
      const { id } = await stt.submit({ audioUrl })
      await release(id)
      return { jobId: id }
    } catch (err) {
      await release(null)
      throw err
    }
  })
}

export type PollStatus = 'pending' | 'completed'

/** One status check; the workflow sleeps 15 s between calls (max 60 min). */
export async function pollTranscriptionStep(
  db: DbLike,
  lectureId: string,
  stt: SttClient,
): Promise<PollStatus> {
  return runStep(
    db,
    lectureId,
    'pollTranscription',
    async (): Promise<PollStatus> => {
      const { sttJobId } = await loadLecture(db, lectureId)
      if (!sttJobId || sttJobId.startsWith(RESERVATION_PREFIX)) {
        throw new PipelineError('stt_failed', 'The transcription job was lost. Please retry.')
      }
      const job = await stt.get(sttJobId)
      if (job.status === 'error') {
        throw new PipelineError(
          'stt_failed',
          `Transcription failed${job.error ? ` (${job.error})` : ''}. Try uploading a transcript instead.`,
        )
      }
      return job.status === 'completed' ? 'completed' : 'pending'
    },
    { isDone: (status) => status === 'completed' },
  )
}

/**
 * Sentences → segments (truncated to the tier limit), then deletes the remote transcript and the
 * audio object. Segments written by an earlier attempt of this run are kept (flag in the step
 * output), so a retry only redoes the deletes.
 */
export async function fetchTranscriptStep(
  db: DbLike,
  lectureId: string,
  stt: SttClient,
): Promise<{ deleted: true }> {
  return runStep(db, lectureId, 'fetchTranscript', async () => {
    const lecture = await loadLecture(db, lectureId)
    const jobId = lecture.sttJobId
    const { segmentsWritten } = await stepOutput<{ segmentsWritten: boolean }>(
      db,
      lectureId,
      'fetchTranscript',
    )
    if (!segmentsWritten) {
      if (!jobId) throw new PipelineError('stt_failed', 'The transcription job was lost.')
      const [job, sentences] = await Promise.all([stt.get(jobId), stt.sentences(jobId)])
      const segments = capToTier(segmentCues(sentences, { hasTimestamps: true }), lecture.tier)
      if (segments.length === 0) {
        throw new PipelineError(
          'unprocessable_input',
          'We couldn’t hear any speech in this recording.',
        )
      }
      const lastEnd = segments.at(-1)?.endMs ?? 0
      const measured = job.audioDurationS ? Math.round(job.audioDurationS * 1000) : lastEnd
      await replaceSegments(db, lectureId, segments, {
        hasTimestamps: true,
        durationMs: Math.min(measured, MEDIA_LIMITS[lecture.tier].maxDurationMs),
        sttConfidence: job.confidence,
      })
      await mergeStepOutput(db, lectureId, 'fetchTranscript', { segmentsWritten: true })
    }
    if (jobId) await stt.remove(jobId)
    if (lecture.audioPath) {
      await deleteObjects(BUCKETS.audio, [lecture.audioPath])
      await db.update(lectures).set({ audioPath: null }).where(eq(lectures.id, lectureId))
    }
    return { deleted: true as const }
  })
}
