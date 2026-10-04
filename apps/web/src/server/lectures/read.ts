import {
  type LectureResponse,
  PipelineStep,
  type TranscriptResponse,
} from '@lectheo/contracts'
import { and, asc, count, eq, gt, isNull, lt, markers, transcriptSegments } from '@lectheo/db'
import type { z } from 'zod'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { type Lecture, loadLectureForRead } from '../ownership'

type LectureDto = z.input<typeof LectureResponse>
type TranscriptDto = z.input<typeof TranscriptResponse>

/** Lecture row → LectureResponse fields (never spreads the row: allow-list by construction). */
export function toLectureDto(
  lecture: Lecture,
  markerCounts: LectureDto['markerCounts'],
): LectureDto {
  const step = PipelineStep.safeParse(lecture.progress?.step)
  const media = lecture.media
  return {
    id: lecture.id,
    courseId: lecture.courseId,
    title: lecture.title,
    seq: lecture.seq,
    source: lecture.source,
    status: lecture.status,
    progress: lecture.progress
      ? {
          step: step.success ? step.data : null,
          done: lecture.progress.done,
          total: lecture.progress.total,
        }
      : null,
    media: media
      ? {
          youtubeId: media.youtubeId ?? null,
          startMs: media.startMs ?? null,
          endMs: media.endMs ?? null,
          localFileName: media.localFileName ?? null,
          durationMs: media.durationMs ?? lecture.durationMs ?? null,
          fallbackAudioUrl: media.fallbackAudioUrl ?? null,
        }
      : null,
    hasTimestamps: lecture.hasTimestamps,
    markerCounts,
    needsReprocess: lecture.needsReprocess,
    error: lecture.error ?? null,
  }
}

/** This user's live markers on a lecture, by kind. */
async function markerCounts(
  db: DbLike,
  lectureId: string,
  userId: string,
): Promise<LectureDto['markerCounts']> {
  const rows = await db
    .select({ kind: markers.kind, n: count() })
    .from(markers)
    .where(
      and(eq(markers.lectureId, lectureId), eq(markers.userId, userId), isNull(markers.deletedAt)),
    )
    .groupBy(markers.kind)
  const of = (kind: 'lost' | 'important') => rows.find((r) => r.kind === kind)?.n ?? 0
  return { lost: of('lost'), important: of('important') }
}

/** GET /lectures/{id}: 2 queries (ownership join, marker counts). */
export async function getLecture(
  actor: Actor,
  lectureId: string,
  db: DbLike = appDb(),
): Promise<LectureDto> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  return toLectureDto(lecture, await markerCounts(db, lecture.id, actor.userId))
}

export interface TranscriptRange {
  fromMs?: number
  toMs?: number
}

/**
 * GET /lectures/{id}/transcript?fromMs&toMs: segments overlapping [fromMs, toMs), with the
 * user's edit applied (`edited_text ?? text`). 2 queries.
 */
export async function getTranscript(
  actor: Actor,
  lectureId: string,
  range: TranscriptRange = {},
  db: DbLike = appDb(),
): Promise<TranscriptDto> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  const rows = await db
    .select({
      idx: transcriptSegments.idx,
      startMs: transcriptSegments.startMs,
      endMs: transcriptSegments.endMs,
      text: transcriptSegments.text,
      editedText: transcriptSegments.editedText,
    })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.lectureId, lecture.id),
        range.fromMs === undefined ? undefined : gt(transcriptSegments.endMs, range.fromMs),
        range.toMs === undefined ? undefined : lt(transcriptSegments.startMs, range.toMs),
      ),
    )
    .orderBy(asc(transcriptSegments.idx))
  return {
    segments: rows.map((s) => ({
      idx: s.idx,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.editedText ?? s.text,
      edited: s.editedText !== null,
    })),
  }
}
