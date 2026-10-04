import {
  type AUDIO_CONTENT_TYPES,
  ErrorEnvelope,
  TranscriptUploadResponse,
  UploadUrlResponse,
} from '@lectheo/contracts'
import type { z } from 'zod'
import { API_BASE, apiFetch, ApiClientError, isApiClientError } from '@/client/api'
import { errorMessage } from '@/components/error-state'

/* Browser-side upload helpers for "add your own lecture" (F1.5–F1.7, F8.3). */

const MB = 1024 * 1024
export const MAX_TRANSCRIPT_BYTES = 2 * MB
export type TranscriptUpload = z.infer<typeof TranscriptUploadResponse>
export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number]

export const TRUNCATED_MESSAGE =
  "This transcript is longer than your account's limit, so we kept the first part."
export const NO_TIMESTAMPS_MESSAGE =
  'This transcript has no timestamps, so markers are off. The map and diagnostic still work.'

const AUDIO_TYPES_BY_EXT: Readonly<Record<string, AudioContentType>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/mp4',
  webm: 'audio/webm',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
}

/** Storage content type for an audio file (browsers disagree on m4a / wav MIME types). */
export function audioContentType(file: File): AudioContentType | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return AUDIO_TYPES_BY_EXT[ext] ?? null
}

/** POST /lectures/{id}/transcript: a file goes multipart, pasted text goes as JSON. */
export async function uploadTranscript(
  lectureId: string,
  input: { file: File } | { text: string },
): Promise<TranscriptUpload> {
  if ('text' in input) {
    return apiFetch(`/lectures/${lectureId}/transcript`, {
      method: 'POST',
      body: { text: input.text },
      schema: TranscriptUploadResponse,
    })
  }
  const form = new FormData()
  form.append('file', input.file)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/lectures/${lectureId}/transcript`, {
      method: 'POST',
      body: form,
      credentials: 'same-origin',
    })
  } catch (cause) {
    throw new ApiClientError({
      code: 'network_error',
      status: 0,
      message: "Couldn't reach Lectheo. Check your connection and try again.",
      cause,
    })
  }
  const json: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const envelope = ErrorEnvelope.safeParse(json)
    throw new ApiClientError(
      envelope.success
        ? { ...envelope.data.error, status: response.status }
        : { code: 'internal_error', status: response.status, message: 'The upload failed.' },
    )
  }
  return TranscriptUploadResponse.parse(json)
}

/** Signed URL from the server, then a PUT straight to Storage with upload progress (0–1). */
export async function uploadAudio(
  lectureId: string,
  file: File,
  contentType: AudioContentType,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const signed = await apiFetch(`/lectures/${lectureId}/audio-upload-url`, {
    method: 'POST',
    body: { contentType, sizeBytes: file.size },
    schema: UploadUrlResponse,
  })
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signed.uploadUrl)
    xhr.setRequestHeader('content-type', contentType)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    const fail = () =>
      reject(
        new ApiClientError({
          code: 'upstream_unavailable',
          status: xhr.status,
          message: 'The audio upload failed. Check your connection and try again.',
        }),
      )
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : fail())
    xhr.onerror = fail
    xhr.send(file)
  })
}

const METADATA_TIMEOUT_MS = 10_000

/** Media duration from local metadata (null if the browser can't read it in time). */
export function readMediaDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement('video')
    const done = (ms: number | null) => {
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(ms)
    }
    const timer = window.setTimeout(() => done(null), METADATA_TIMEOUT_MS)
    el.preload = 'metadata'
    el.onloadedmetadata = () =>
      done(Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null)
    el.onerror = () => done(null)
    el.src = url
  })
}

const formatReset = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** errorMessage plus the limit details F8.3 asks for (reset time, size limit). */
export function limitMessage(error: unknown): string {
  const base = errorMessage(error)
  if (!isApiClientError(error)) return base
  const { resetAt, maxBytes } = error.details ?? {}
  if (error.code === 'quota_exceeded' && typeof resetAt === 'string') {
    return `${base} It resets ${formatReset(resetAt)}.`
  }
  if (error.code === 'payload_too_large' && typeof maxBytes === 'number' && !base.includes('MB')) {
    return `${base} The limit is ${Math.round(maxBytes / MB)} MB.`
  }
  return base
}
