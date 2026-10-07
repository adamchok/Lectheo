import { z } from 'zod'
import { ClientId, Id, Ms, SourceRef } from '../common'
import {
  LectureSource,
  LectureStatus,
  MarkerCapture,
  MarkerKind,
  MasteryState,
  PipelineStep,
  ReprocessFromStep,
} from '../enums'
import { Chapter, StudyTarget } from '../payloads'

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

/** A chapter with its times read from the segments (F11). `endMs` is the last segment's end. */
export const LectureChapter = z.object({
  id: Chapter.shape.id,
  title: z.string(),
  summary: z.string(),
  startMs: Ms,
  endMs: Ms,
  conceptIds: z.array(Id),
})
export type LectureChapter = z.infer<typeof LectureChapter>

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
  /** In order; empty for lectures without timestamps or before the map exists. */
  chapters: z.array(LectureChapter),
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
export const TranscriptTextRequest = z.object({
  text: z
    .string()
    .min(1)
    .max(2 * 1024 * 1024),
})
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

/** Watch-mode or recorder marker at the player's time. */
export const MarkerInput = z.object({
  id: ClientId,
  kind: MarkerKind,
  tMs: Ms,
  capture: MarkerCapture.exclude(['study']),
})
export type MarkerInput = z.infer<typeof MarkerInput>
/** Study mark on a concept (F9.4): the server sets tMs to the concept's first source moment. */
export const ConceptMarkerInput = z.strictObject({
  id: ClientId,
  kind: MarkerKind,
  capture: z.literal('study'),
  conceptId: Id,
})
/** Study mark on a chapter (F11.4): tMs = the chapter's start, linked to all its concepts. */
export const ChapterMarkerInput = z.strictObject({
  id: ClientId,
  kind: MarkerKind,
  capture: z.literal('study'),
  chapterId: Chapter.shape.id,
})
export const MarkerBody = z.union([MarkerInput, ConceptMarkerInput, ChapterMarkerInput])
export type MarkerBody = z.infer<typeof MarkerBody>
export const PostMarkersRequest = z.object({ markers: z.array(MarkerBody).min(1).max(200) })
export const PostMarkersResponse = z.object({
  accepted: z.number().int(),
  duplicates: z.number().int(),
})
export const MarkerDto = z.object({
  id: Id,
  kind: MarkerKind,
  tMs: Ms,
  capture: MarkerCapture,
  /** Study marks only: the concept or chapter that was marked. */
  target: StudyTarget.nullable(),
  conceptIds: z.array(Id),
})
export const ListMarkersResponse = z.object({ data: z.array(MarkerDto) })

/** One concept of the Study brief (F9.2): learning order, key points, clips, marks. */
export const BriefConcept = z.object({
  id: Id,
  name: z.string(),
  mastery: z.object({ state: MasteryState, confidentMistake: z.boolean() }),
  prerequisites: z.array(z.object({ id: Id, name: z.string() })),
  summary: z.string(),
  keyPoints: z.array(z.object({ id: z.string(), text: z.string(), sources: z.array(SourceRef) })),
  /** The concept's source moments, neighbouring segments merged; the first is its first moment. */
  clips: z.array(z.object({ startMs: Ms, endMs: Ms })),
  clipMs: Ms,
  chapter: z.object({ id: Chapter.shape.id, title: z.string(), startMs: Ms }).nullable(),
  /** This user's live markers in this lecture linked to the concept. */
  marks: z.object({ lost: z.number().int(), important: z.number().int() }),
})
export type BriefConcept = z.infer<typeof BriefConcept>

/** GET /lectures/{id}/brief (F9). */
export const BriefResponse = z.object({
  lectureId: Id,
  readMinutes: z.number().int().nonnegative(),
  /** Length of the video to watch; null without media. */
  videoMinutes: z.number().int().nonnegative().nullable(),
  concepts: z.array(BriefConcept),
})
export type BriefResponse = z.infer<typeof BriefResponse>
