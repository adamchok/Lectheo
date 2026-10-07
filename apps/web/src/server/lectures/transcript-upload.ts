import { TranscriptTextRequest, type TranscriptUploadResponse } from '@lectheo/contracts'
import { and, eq, inArray, lectures, transcriptSegments } from '@lectheo/db'
import { parseTranscript, type Segment, segmentCues } from '@lectheo/domain'
import type { z } from 'zod'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, invalidState } from '../errors'
import { loadLectureForWrite } from '../ownership'
import { MEDIA_LIMITS, tierOf, type Tier } from '../quota'
import { takeRateLimit, TRANSCRIPT_UPLOAD_LIMIT } from '../rate-limit'

/*
 * POST /lectures/{id}/transcript (API Spec §5, F1.5, F1.7). Parsed at upload time: segments,
 * has_timestamps and duration_ms are written here; the raw file is kept in Storage at
 * transcripts/{userId}/{lectureId}.{ext}. The pipeline starts from these segments.
 */

type UploadDto = z.input<typeof TranscriptUploadResponse>
export type TranscriptExt = 'vtt' | 'srt' | 'txt'
export interface TranscriptInput {
  raw: string
  ext: TranscriptExt
}
/** Injected so tests don't touch Supabase Storage. */
export type StoreTranscript = (path: string, raw: string, contentType: string) => Promise<void>

export const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024
/** Multipart framing / JSON escaping on top of the 2 MB of transcript text. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024
const TRANSCRIPT_EXTS: readonly TranscriptExt[] = ['vtt', 'srt', 'txt']
const MINUTE_MS = 60_000
/** ≈150 spoken words/min × 1.33 tokens/word; tokens estimated as chars / 4. */
const TOKENS_PER_MINUTE = 200
const CHARS_PER_TOKEN = 4
/** Token cap by tier (Architecture §9.2: sample ≈ 20 min of speech, Google ≈ 2 h). */
export const TRANSCRIPT_TOKEN_LIMITS: Record<Tier, number> = {
  sample: (MEDIA_LIMITS.sample.maxDurationMs / MINUTE_MS) * TOKENS_PER_MINUTE,
  google: (MEDIA_LIMITS.google.maxDurationMs / MINUTE_MS) * TOKENS_PER_MINUTE,
}
const UPLOADABLE_STATUSES = ['draft', 'uploading', 'failed'] as const
const CONTENT_TYPES: Record<TranscriptExt, string> = {
  vtt: 'text/vtt',
  srt: 'application/x-subrip',
  txt: 'text/plain',
}

/**
 * Teams .docx was dropped (7 Oct 2026): it has one timestamp per speaker turn, which breaks
 * marker alignment. Teams offers the .vtt from the same menu.
 */
export const TEAMS_DOCX_MESSAGE =
  'Teams: download the transcript as .vtt instead (Transcript → Download → .vtt).'

const unreadable = (message: string): ApiError => new ApiError('unprocessable_input', message)
const tooLarge = (details: Record<string, unknown>): ApiError =>
  new ApiError('payload_too_large', 'Transcripts can be up to 2 MB.', {
    maxBytes: MAX_TRANSCRIPT_BYTES,
    ...details,
  })

/** Counts one upload for the actor; 429 `rate_limited` past the limit. Call before the body. */
export async function takeTranscriptUpload(actor: Actor, db: DbLike = appDb()): Promise<void> {
  if (!(await takeRateLimit(db, `transcript:${actor.userId}`, TRANSCRIPT_UPLOAD_LIMIT))) {
    throw new ApiError('rate_limited')
  }
}

export async function uploadTranscript(
  actor: Actor,
  lectureId: string,
  input: TranscriptInput,
  db: DbLike = appDb(),
  store: StoreTranscript = defaultStore,
): Promise<UploadDto> {
  const { lecture } = await loadLectureForWrite(actor, lectureId, db)
  if (lecture.source !== 'import' && lecture.source !== 'transcript') {
    throw invalidState('This lecture takes audio, not a transcript.')
  }
  if (!(UPLOADABLE_STATUSES as readonly string[]).includes(lecture.status)) {
    throw invalidState('The transcript can only change before processing starts.', {
      status: lecture.status,
    })
  }
  const sizeBytes = new TextEncoder().encode(input.raw).length
  if (sizeBytes > MAX_TRANSCRIPT_BYTES) throw tooLarge({ sizeBytes })

  const { segments, hasTimestamps, truncated } = toSegments(actor, input)
  // Untimed text keeps a known length (an import's media duration).
  const durationMs = hasTimestamps
    ? Math.max(...segments.map((s) => s.endMs))
    : lecture.durationMs

  await store(`${actor.userId}/${lecture.id}.${input.ext}`, input.raw, CONTENT_TYPES[input.ext])
  await db.transaction(async (tx) => {
    const claimed = await tx
      .update(lectures)
      .set({ status: 'draft', hasTimestamps, durationMs, error: null, chapters: null })
      .where(and(eq(lectures.id, lecture.id), inArray(lectures.status, [...UPLOADABLE_STATUSES])))
      .returning({ id: lectures.id })
    if (claimed.length === 0) throw invalidState('This lecture is already being processed.')
    // A re-upload replaces the previous transcript (and the chapters citing its segments).
    await tx.delete(transcriptSegments).where(eq(transcriptSegments.lectureId, lecture.id))
    await tx
      .insert(transcriptSegments)
      .values(segments.map((s) => ({ lectureId: lecture.id, ...s })))
  })
  return { segments: segments.length, hasTimestamps, durationMs, truncated }
}

/** Parse → speaker-stripped segments → cut to the tier's duration and token limits. */
export function toSegments(
  actor: Actor,
  input: TranscriptInput,
): { segments: Segment[]; hasTimestamps: boolean; truncated: boolean } {
  if (looksBinary(input.raw)) throw unreadable("That file isn't a text transcript.")
  const parsed = parseTranscript(input.raw)
  if (input.ext !== 'txt' && parsed.format === 'text') {
    throw unreadable(`We couldn't find any timed captions in that .${input.ext} file.`)
  }
  const all = segmentCues(parsed.cues, { hasTimestamps: parsed.hasTimestamps })
  if (all.length === 0) throw unreadable('That transcript has no readable text.')

  const tier = tierOf(actor)
  const maxMs = MEDIA_LIMITS[tier].maxDurationMs
  const maxChars = TRANSCRIPT_TOKEN_LIMITS[tier] * CHARS_PER_TOKEN
  const segments: Segment[] = []
  let chars = 0
  for (const s of all) {
    chars += s.text.length
    const overTime = parsed.hasTimestamps && s.startMs >= maxMs
    if (segments.length > 0 && (chars > maxChars || overTime)) break
    segments.push(s.endMs > maxMs ? { ...s, endMs: maxMs } : s)
  }
  return {
    segments,
    hasTimestamps: parsed.hasTimestamps,
    truncated: segments.length < all.length,
  }
}

/** NUL bytes or many U+FFFD replacement chars → a binary file read as text. */
function looksBinary(raw: string): boolean {
  if (raw.includes('\u0000')) return true
  const replaced = raw.match(/�/g)?.length ?? 0
  return replaced / raw.length > 0.01
}

/** Multipart `file` (.vtt / .srt / .txt ≤ 2 MB) or JSON `{ text }`. */
export async function readTranscriptRequest(req: Request): Promise<TranscriptInput> {
  // Reject before buffering the body; the per-file check below is exact.
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (declared > MAX_TRANSCRIPT_BYTES + MULTIPART_OVERHEAD_BYTES) {
    throw tooLarge({ sizeBytes: declared })
  }
  const type = req.headers.get('content-type') ?? ''
  if (type.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) {
      throw new ApiError('validation_failed', 'Attach the transcript as `file`.')
    }
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext === 'docx') throw unreadable(TEAMS_DOCX_MESSAGE)
    if (ext !== 'vtt' && ext !== 'srt' && ext !== 'txt') {
      throw unreadable('Transcripts must be .vtt, .srt or .txt files.')
    }
    if (file.size > MAX_TRANSCRIPT_BYTES) throw tooLarge({ sizeBytes: file.size })
    return { raw: await file.text(), ext }
  }
  const json: unknown = await req.json().catch(() => null)
  const text = (json as { text?: unknown } | null)?.text
  // An oversize paste is a 413 like an oversize file, not a schema failure.
  if (typeof text === 'string' && text.length > MAX_TRANSCRIPT_BYTES) {
    throw tooLarge({ sizeBytes: new TextEncoder().encode(text).length })
  }
  const parsed = TranscriptTextRequest.safeParse(json)
  if (!parsed.success) {
    throw new ApiError('validation_failed', 'Send a transcript file or JSON `{ text }`.')
  }
  return { raw: parsed.data.text, ext: 'txt' }
}

const defaultStore: StoreTranscript = async (path, raw, contentType) => {
  const { supabaseAdmin } = await import('../supabase')
  const { error } = await supabaseAdmin()
    .storage.from('transcripts')
    .upload(path, raw, { contentType, upsert: true })
  if (error) {
    throw new ApiError('upstream_unavailable', 'File storage is unavailable. Please try again.', {
      service: 'storage',
      op: 'upload',
    })
  }
  // Drop an earlier upload in another format so a re-parse can't pick the stale file.
  const base = path.replace(/\.[^.]+$/, '')
  const stale = TRANSCRIPT_EXTS.map((ext) => `${base}.${ext}`).filter((p) => p !== path)
  const { error: removeError } = await supabaseAdmin().storage.from('transcripts').remove(stale)
  if (removeError) {
    console.warn(JSON.stringify({ event: 'storage_cleanup_failed', reason: removeError.message }))
  }
}
