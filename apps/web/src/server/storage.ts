import 'server-only'
import type { Actor } from './auth'
import { ApiError } from './errors'
import { MEDIA_LIMITS, tierOf } from './quota'
import { supabaseAdmin } from './supabase'

/* Private Storage buckets (Data Model §4). The browser only ever gets signed URLs. */

const MB = 1024 * 1024

export const BUCKETS = {
  audio: 'audio',
  transcripts: 'transcripts',
  assets: 'assets',
} as const
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS]

/** Bucket maxima (also set on the buckets in supabase/config.toml). */
export const BUCKET_MAX_BYTES: Record<Bucket, number> = {
  audio: 50 * MB,
  transcripts: 2 * MB,
  assets: 20 * MB,
}

/** Supabase signed upload URLs are valid for 2 hours. */
const UPLOAD_URL_TTL_MS = 2 * 60 * 60 * 1000
export const DOWNLOAD_URL_TTL_S = 3600

export const storagePaths = {
  audio: (userId: string, lectureId: string) => `${userId}/${lectureId}`,
  transcript: (userId: string, lectureId: string, ext: 'vtt' | 'srt' | 'txt' | 'docx') =>
    `${userId}/${lectureId}.${ext}`,
  slides: (userId: string, lectureId: string) => `${userId}/${lectureId}/slides.pdf`,
}

/** Per-tier max upload size: audio depends on the tier, the other buckets don't. */
export function maxUploadBytes(actor: Actor, bucket: Bucket): number {
  return bucket === 'audio' ? MEDIA_LIMITS[tierOf(actor)].maxAudioBytes : BUCKET_MAX_BYTES[bucket]
}

/**
 * Throws when a declared size is over the actor's limit: 403 `sample_account_restricted` when a
 * Google account could upload it, otherwise 413 `payload_too_large`.
 */
export function assertUploadSize(actor: Actor, bucket: Bucket, sizeBytes: number): void {
  const limit = maxUploadBytes(actor, bucket)
  if (sizeBytes <= limit) return
  const details = { maxBytes: limit, sizeBytes }
  if (actor.isSample && sizeBytes <= BUCKET_MAX_BYTES[bucket]) {
    throw new ApiError(
      'sample_account_restricted',
      'Sample accounts can upload up to 20 MB.',
      details,
    )
  }
  throw new ApiError('payload_too_large', undefined, details)
}

export interface SignedUpload {
  uploadUrl: string
  path: string
  expiresAt: string
}

/**
 * Signed upload URL after the size check. The client PUTs straight to Storage.
 * ponytail: the declared size is checked here; the bucket's file_size_limit is the hard cap.
 */
export async function createUploadUrl(
  actor: Actor,
  bucket: Bucket,
  path: string,
  sizeBytes: number,
): Promise<SignedUpload> {
  assertUploadSize(actor, bucket, sizeBytes)
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUploadUrl(path, { upsert: true })
  if (error || !data) throw storageError('createSignedUploadUrl', error)
  return {
    uploadUrl: data.signedUrl,
    path: data.path,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_MS).toISOString(),
  }
}

/** Signed download URL (default 1 h), e.g. for AssemblyAI to fetch audio. */
export async function createDownloadUrl(
  bucket: Bucket,
  path: string,
  expiresInS = DOWNLOAD_URL_TTL_S,
): Promise<string> {
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInS)
  if (error || !data) throw storageError('createSignedUrl', error)
  return data.signedUrl
}

/** Deletes objects; deleting a missing object is not an error. */
export async function deleteObjects(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabaseAdmin().storage.from(bucket).remove(paths)
  if (error) throw storageError('remove', error)
}

function storageError(op: string, cause: unknown): Error {
  const message = cause instanceof Error ? cause.message : 'no data'
  return new ApiError('upstream_unavailable', 'File storage is unavailable. Please try again.', {
    service: 'storage',
    op,
    ...(process.env.NODE_ENV === 'development' ? { cause: message } : {}),
  })
}
