import type { AUDIO_CONTENT_TYPES } from '@lectheo/contracts'
import { and, eq, inArray, lectures } from '@lectheo/db'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { invalidState } from '../errors'
import { loadLectureForWrite } from '../ownership'

/*
 * POST /lectures/{id}/audio-upload-url (API Spec §5, F1.6). The per-tier size check happens in
 * createUploadUrl; the browser then PUTs straight to Storage. audio_path is set here, so the
 * pipeline (which owns transcription) finds the object at a known path.
 */

export interface AudioUploadInput {
  contentType: (typeof AUDIO_CONTENT_TYPES)[number]
  sizeBytes: number
}
export interface SignedUpload {
  uploadUrl: string
  path: string
  expiresAt: string
}
/** storage.ts#createUploadUrl for the audio bucket; injected so tests don't touch Storage. */
export type SignAudioUpload = (
  actor: Actor,
  path: string,
  sizeBytes: number,
) => Promise<SignedUpload>

const UPLOADABLE_STATUSES = ['draft', 'uploading', 'failed'] as const
const notUploadable = (status: string) =>
  invalidState('Audio can only change before processing starts.', { status })

export async function createAudioUpload(
  actor: Actor,
  lectureId: string,
  input: AudioUploadInput,
  db: DbLike = appDb(),
  sign: SignAudioUpload = defaultSign,
): Promise<SignedUpload> {
  const { lecture } = await loadLectureForWrite(actor, lectureId, db)
  if (lecture.source !== 'audio') throw invalidState('This lecture takes a transcript, not audio.')
  if (!(UPLOADABLE_STATUSES as readonly string[]).includes(lecture.status)) {
    throw notUploadable(lecture.status)
  }
  const signed = await sign(actor, `${actor.userId}/${lecture.id}`, input.sizeBytes)
  const claimed = await db
    .update(lectures)
    .set({ status: 'uploading', audioPath: signed.path, error: null })
    .where(and(eq(lectures.id, lecture.id), inArray(lectures.status, [...UPLOADABLE_STATUSES])))
    .returning({ id: lectures.id })
  if (claimed.length === 0) throw notUploadable('processing')
  return signed
}

const defaultSign: SignAudioUpload = async (actor, path, sizeBytes) => {
  const { createUploadUrl } = await import('../storage')
  return createUploadUrl(actor, 'audio', path, sizeBytes)
}
