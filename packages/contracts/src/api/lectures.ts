import { z } from 'zod'
import { ClientId, Id, Ms } from '../common'
import {
  LectureSource,
  LectureStatus,
  MarkerCapture,
  MarkerKind,
  PipelineStep,
  ReprocessFromStep,
} from '../enums'

/** `library` can't be created at runtime. */
export const CreateLectureRequest = z.object({
  id: ClientId,
  courseId: Id,
  title: z.string().trim().min(1).max(200),
  source: LectureSource.exclude(['library']),
  /** Import (B) only: metadata of the local file. The file itself is never uploaded. */
  media: z
    .object({ localFileName: z.string().trim().min(1).max(255), durationMs: Ms.nullable() })
    .optional(),
})

export const LectureMedia = z.object({
  youtubeId: z.string().nullable(),
  startMs: Ms.nullable().optional(),
  endMs: Ms.nullable().optional(),
  localFileName: z.string().nullable().optional(),
  durationMs: Ms.nullable(),
  /** Library only: official MP3 on the same timeline, used when the embed is blocked. */
  fallbackAudioUrl: z.string().nullable().optional(),
})

export const LectureResponse = z.object({
  id: Id,
  courseId: Id,
  title: z.string(),
  seq: z.number().int(),
  source: LectureSource,
  status: LectureStatus,
  progress: z
    .object({ step: PipelineStep.nullable(), done: z.number().int(), total: z.number().int() })
    .nullable(),
  media: LectureMedia.nullable(),
  hasTimestamps: z.boolean(),
  markerCounts: z.object({ lost: z.number().int(), important: z.number().int() }),
  needsReprocess: z.boolean(),
  error: z.object({ step: z.string(), code: z.string(), message: z.string() }).nullable(),
})
export type LectureResponse = z.infer<typeof LectureResponse>

export const PatchLectureRequest = z.object({ title: z.string().trim().min(1).max(200) })

export const AUDIO_CONTENT_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
] as const
export const AudioUploadUrlRequest = z.object({
  contentType: z.enum(AUDIO_CONTENT_TYPES),
  sizeBytes: z.number().int().positive(),
})
export const UploadUrlResponse = z.object({
  uploadUrl: z.string(),
  path: z.string(),
  expiresAt: z.iso.datetime(),
})

/** JSON variant of POST /lectures/{id}/transcript (the file variant is multipart). */
export const TranscriptTextRequest = z.object({ text: z.string().min(1).max(2 * 1024 * 1024) })
export const TranscriptUploadResponse = z.object({
  segments: z.number().int(),
  hasTimestamps: z.boolean(),
  durationMs: Ms.nullable(),
  /** True when the transcript was cut to the account's length limit. */
  truncated: z.boolean().optional(),
})
export const TranscriptQuery = z.object({
  fromMs: z.coerce.number().int().nonnegative().optional(),
  toMs: z.coerce.number().int().nonnegative().optional(),
})
export const TranscriptSegmentDto = z.object({
  idx: z.number().int(),
  startMs: Ms,
  endMs: Ms,
  text: z.string(),
  edited: z.boolean(),
})
export const TranscriptResponse = z.object({ segments: z.array(TranscriptSegmentDto) })
export const PatchSegmentRequest = z.object({ editedText: z.string().min(1).max(5000) })

export const ProcessQuery = z.object({ from: ReprocessFromStep.optional() })
export const ProcessResponse = z.object({ status: z.literal('processing') })

export const MarkerInput = z.object({
  id: ClientId,
  kind: MarkerKind,
  tMs: Ms,
  capture: MarkerCapture,
})
export type MarkerInput = z.infer<typeof MarkerInput>
export const PostMarkersRequest = z.object({ markers: z.array(MarkerInput).min(1).max(200) })
export const PostMarkersResponse = z.object({
  accepted: z.number().int(),
  duplicates: z.number().int(),
})
export const MarkerDto = MarkerInput.extend({ id: Id, conceptIds: z.array(Id) })
export const ListMarkersResponse = z.object({ data: z.array(MarkerDto) })
