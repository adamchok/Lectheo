import { FAKE_MODEL, GOOGLE_DIRECT, transcribeChunkTask } from '@lectheo/ai'
import { and, eq, sql, youtubeTranscriptChunks, youtubeTranscripts } from '@lectheo/db'
import type { Cue, VideoChunk } from '@lectheo/domain'
import type { DbLike } from './db'
import { isAiFake } from './env'

/*
 * The YouTube transcript cache (F10.5–F10.6), keyed by video, model and prompt version so a new
 * prompt or a fake run never serves an old or fake transcript. Holds finished transcripts,
 * negative verdicts (no speech, not English) and the chunks of a transcription in progress.
 */

/** The verdicts cached so the same video is refused before any spend. */
export type TranscriptRefusal = 'no_speech' | 'not_english'

export interface TranscriberKey {
  readonly videoId: string
  readonly model: string
  readonly promptVersion: string
}

/** The key of transcripts this deployment makes right now. */
export const transcriberKey = (videoId: string): TranscriberKey => ({
  videoId,
  model: isAiFake() ? FAKE_MODEL : GOOGLE_DIRECT.model,
  promptVersion: transcribeChunkTask.promptVersion,
})

const transcriptRow = (k: TranscriberKey) =>
  and(
    eq(youtubeTranscripts.videoId, k.videoId),
    eq(youtubeTranscripts.model, k.model),
    eq(youtubeTranscripts.promptVersion, k.promptVersion),
  )
const chunkRows = (k: TranscriberKey) =>
  and(
    eq(youtubeTranscriptChunks.videoId, k.videoId),
    eq(youtubeTranscriptChunks.model, k.model),
    eq(youtubeTranscriptChunks.promptVersion, k.promptVersion),
  )

export type CachedTranscript =
  | { readonly kind: 'transcript'; readonly cues: Cue[] }
  | { readonly kind: 'refusal'; readonly refusal: TranscriptRefusal }

export async function readCachedTranscript(
  db: DbLike,
  key: TranscriberKey,
): Promise<CachedTranscript | null> {
  const [row] = await db
    .select({ cues: youtubeTranscripts.cues, refusal: youtubeTranscripts.refusal })
    .from(youtubeTranscripts)
    .where(transcriptRow(key))
    .limit(1)
  if (!row) return null
  return row.refusal
    ? { kind: 'refusal', refusal: row.refusal as TranscriptRefusal }
    : { kind: 'transcript', cues: row.cues }
}

/** Stores a finished transcript or a refusal, and drops the chunks it was built from. */
export async function saveCachedTranscript(
  db: DbLike,
  key: TranscriberKey,
  durationMs: number,
  result: CachedTranscript,
): Promise<void> {
  await db
    .insert(youtubeTranscripts)
    .values({
      ...key,
      durationMs,
      cues: result.kind === 'transcript' ? result.cues : [],
      refusal: result.kind === 'refusal' ? result.refusal : null,
    })
    .onConflictDoNothing()
  await deleteChunks(db, key)
}

export async function deleteChunks(db: DbLike, key: TranscriberKey): Promise<void> {
  await db.delete(youtubeTranscriptChunks).where(chunkRows(key))
}

export interface StoredChunk {
  readonly cues: Cue[]
  readonly attempts: number
}

const chunkId = (c: VideoChunk): string => `${c.startMs}-${c.endMs}`

/** Finished chunks of this video's transcription, by `start-end`. */
export async function readChunks(
  db: DbLike,
  key: TranscriberKey,
): Promise<Map<string, StoredChunk>> {
  const rows = await db
    .select({
      startMs: youtubeTranscriptChunks.startMs,
      endMs: youtubeTranscriptChunks.endMs,
      cues: youtubeTranscriptChunks.cues,
      attempts: youtubeTranscriptChunks.attempts,
    })
    .from(youtubeTranscriptChunks)
    .where(chunkRows(key))
  return new Map(rows.map((r) => [chunkId(r), { cues: r.cues, attempts: r.attempts }]))
}

export const storedChunk = (
  chunks: ReadonlyMap<string, StoredChunk>,
  chunk: VideoChunk,
): StoredChunk | undefined => chunks.get(chunkId(chunk))

/** Saves one chunk's cues as it finishes; a retry replaces them and counts the attempt. */
export async function saveChunk(
  db: DbLike,
  key: TranscriberKey,
  chunk: VideoChunk,
  cues: readonly Cue[],
  attempts: number,
): Promise<void> {
  await db
    .insert(youtubeTranscriptChunks)
    .values({ ...key, startMs: chunk.startMs, endMs: chunk.endMs, cues: [...cues], attempts })
    .onConflictDoUpdate({
      target: [
        youtubeTranscriptChunks.videoId,
        youtubeTranscriptChunks.model,
        youtubeTranscriptChunks.promptVersion,
        youtubeTranscriptChunks.startMs,
        youtubeTranscriptChunks.endMs,
      ],
      set: { cues: sql`excluded.cues`, attempts: sql`excluded.attempts` },
    })
}
