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
const MINUTE_MS = 60_000
export const MAX_TRANSCRIPT_BYTES = 2 * MB
export type TranscriptUpload = z.infer<typeof TranscriptUploadResponse>
export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number]

export const TRUNCATED_MESSAGE =
  "This transcript is longer than your account's limit, so we kept the first part."
export const NO_TIMESTAMPS_MESSAGE =
  'This transcript has no timestamps, so markers are off. The map and diagnostic still work.'
export const UNPLAYABLE_MESSAGE =
  "This browser can't play this file. Try an MP4 (H.264) or WebM file."

/**
 * Mirrors server/quota.ts MEDIA_LIMITS (Architecture §9.2) so a too-big file is rejected before
 * a lecture is created and the daily quota is spent. The server still enforces them.
 */
const LIMITS = {
  sample: { maxAudioBytes: 20 * MB, maxDurationMs: 20 * MINUTE_MS },
  google: { maxAudioBytes: 50 * MB, maxDurationMs: 120 * MINUTE_MS },
} as const

/** A message when the audio file is over the account's size limit, else null. */
export function audioSizeProblem(sizeBytes: number, isSample: boolean): string | null {
  const { sample, google } = LIMITS
  if (isSample && sizeBytes > sample.maxAudioBytes && sizeBytes <= google.maxAudioBytes) {
    return 'Sample accounts can upload audio up to 20 MB. Sign in with Google for up to 50 MB.'
  }
  return sizeBytes > google.maxAudioBytes ? 'Audio files can be up to 50 MB.' : null
}

/** A message when the recording is over the account's length limit, else null. */
export function durationProblem(durationMs: number | null, isSample: boolean): string | null {
  if (durationMs === null) return null
  const { sample, google } = LIMITS
  if (isSample && durationMs > sample.maxDurationMs && durationMs <= google.maxDurationMs) {
    return 'Sample accounts can add lectures up to 20 minutes. Sign in with Google for up to 2 hours.'
  }
  return durationMs > google.maxDurationMs ? 'Lectures can be up to 2 hours long.' : null
}

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

/** No upload progress for this long → give up (a hung connection, not a slow one). */
const STALL_MS = 60_000

function storageFailure(status: number): ApiClientError {
  const message =
    status === 413
      ? 'That file is too large for your account.'
      : status >= 400 && status < 500
        ? 'Storage rejected the upload (the link may have expired or the format is unsupported). Please try again.'
        : 'The audio upload failed. Check your connection and try again.'
  return new ApiClientError({ code: 'upstream_unavailable', status, message })
}

/**
 * Signed URL from the server, then a PUT straight to Storage with upload progress (0–1).
 * Aborting `signal` (e.g. leaving the page) cancels it with an AbortError.
 */
export async function uploadAudio(
  lectureId: string,
  file: File,
  contentType: AudioContentType,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const signed = await apiFetch(`/lectures/${lectureId}/audio-upload-url`, {
    method: 'POST',
    body: { contentType, sizeBytes: file.size },
    schema: UploadUrlResponse,
    signal,
  })
  if (signal.aborted) throw new DOMException('Upload cancelled', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    let stalled = false
    let stallTimer = 0
    const armStall = () => {
      window.clearTimeout(stallTimer)
      stallTimer = window.setTimeout(() => {
        stalled = true
        xhr.abort()
      }, STALL_MS)
    }
    const settle = (fn: () => void) => {
      window.clearTimeout(stallTimer)
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    const onAbort = () => xhr.abort()
    xhr.open('PUT', signed.uploadUrl)
    xhr.setRequestHeader('content-type', contentType)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.upload.onprogress = (e) => {
      armStall()
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      settle(() =>
        xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(storageFailure(xhr.status)),
      )
    xhr.onerror = () => settle(() => reject(storageFailure(0)))
    xhr.onabort = () =>
      settle(() =>
        reject(
          stalled
            ? new ApiClientError({
                code: 'network_error',
                status: 0,
                message: 'The upload stopped making progress. Check your connection and try again.',
              })
            : new DOMException('Upload cancelled', 'AbortError'),
        ),
      )
    signal.addEventListener('abort', onAbort)
    if (signal.aborted) onAbort()
    armStall()
    xhr.send(file)
  })
}

export const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError'

const METADATA_TIMEOUT_MS = 10_000

export interface MediaProbe {
  /** False when the browser reported a decode error. */
  playable: boolean
  /** Null when unknown (no metadata in time). */
  durationMs: number | null
}

/** Reads local media metadata: can this browser play it, and how long is it. */
export function probeMedia(file: File): Promise<MediaProbe> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const el = document.createElement('video')
    const done = (probe: MediaProbe) => {
      window.clearTimeout(timer)
      URL.revokeObjectURL(url)
      resolve(probe)
    }
    const timer = window.setTimeout(
      () => done({ playable: true, durationMs: null }),
      METADATA_TIMEOUT_MS,
    )
    el.preload = 'metadata'
    el.onloadedmetadata = () =>
      done({
        playable: true,
        durationMs: Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : null,
      })
    el.onerror = () => done({ playable: false, durationMs: null })
    el.src = url
  })
}

/** Identity of a picked file, so a retry with the same file reuses the same lecture id. */
export const fileKey = (file: File): string => `${file.name}:${file.size}:${file.lastModified}`

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
