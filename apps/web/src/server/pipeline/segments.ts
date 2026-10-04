import {
  and,
  asc,
  conceptEdges,
  conceptOccurrences,
  concepts,
  courses,
  sql,
  eq,
  lectures,
  profiles,
  transcriptSegments,
} from '@lectheo/db'
import { estimateMinutesFromText, type Segment } from '@lectheo/domain'
import type { DbLike } from '../db'
import { MEDIA_LIMITS, type Tier } from '../quota'
import { PipelineError } from './state'

/* Lecture + transcript reads/writes shared by the pipeline steps. */

export type PipelineLecture = typeof lectures.$inferSelect & { ownerId: string; tier: Tier }

/** The lecture with its course owner and the owner's tier (limits are per owner). */
export async function loadLecture(db: DbLike, lectureId: string): Promise<PipelineLecture> {
  const [row] = await db
    .select({ lecture: lectures, ownerId: courses.ownerId, ownerKind: profiles.kind })
    .from(lectures)
    .innerJoin(courses, eq(courses.id, lectures.courseId))
    .leftJoin(profiles, eq(profiles.id, courses.ownerId))
    .where(eq(lectures.id, lectureId))
    .limit(1)
  // Library courses have no owner and never run through the pipeline.
  if (!row?.ownerId) throw new PipelineError('not_found', 'This lecture no longer exists.')
  const tier: Tier = row.ownerKind === 'sample' ? 'sample' : 'google'
  return { ...row.lecture, ownerId: row.ownerId, tier }
}

export interface LectureSegment {
  idx: number
  startMs: number
  endMs: number
  text: string
}

/** Segments in order, with the student's correction applied (`edited_text ?? text`). */
export async function loadSegments(db: DbLike, lectureId: string): Promise<LectureSegment[]> {
  const rows = await db
    .select({
      idx: transcriptSegments.idx,
      startMs: transcriptSegments.startMs,
      endMs: transcriptSegments.endMs,
      text: transcriptSegments.text,
      editedText: transcriptSegments.editedText,
    })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.lectureId, lectureId))
    .orderBy(asc(transcriptSegments.idx))
  return rows.map(({ editedText, ...s }) => ({ ...s, text: editedText ?? s.text }))
}

export async function hasSegments(db: DbLike, lectureId: string): Promise<boolean> {
  const [row] = await db
    .select({ idx: transcriptSegments.idx })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.lectureId, lectureId))
    .limit(1)
  return Boolean(row)
}

/** Timed segments past the owner's tier limit are dropped (duration is measured, not trusted). */
export function capToTier(segments: readonly Segment[], tier: Tier): Segment[] {
  const max = MEDIA_LIMITS[tier].maxDurationMs
  return segments.filter((s) => s.endMs === 0 || s.startMs < max)
}

/**
 * Deletes the course's concepts that no lecture mentions any more, unless someone has practised
 * them (deleting a concept cascades to its items, activities and attempts; Data Model invariant 6).
 */
export async function dropOrphanConcepts(db: DbLike, courseId: string): Promise<void> {
  await db.delete(concepts).where(
    and(
      eq(concepts.courseId, courseId),
      sql`not exists (select 1 from concept_occurrences o where o.concept_id = "concepts"."id")`,
      sql`not exists (select 1 from attempts a where a.concept_id = "concepts"."id")`,
      sql`not exists (select 1 from activities a where a.concept_id = "concepts"."id")`,
      sql`not exists (select 1 from items i join attempts a on a.item_id = i.id
          where i.concept_id = "concepts"."id")`,
    ),
  )
}

/**
 * Replaces the lecture's transcript (a re-parse or a new transcription). Grounding of this
 * lecture's concepts cites the old indexes, so its occurrences and edges go too, and concepts no
 * lecture mentions any more are dropped; items stay (attempts reference them).
 */
export async function replaceSegments(
  db: DbLike,
  lectureId: string,
  segments: readonly Segment[],
  meta: { hasTimestamps: boolean; durationMs: number | null; sttConfidence?: number | null },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(conceptOccurrences).where(eq(conceptOccurrences.lectureId, lectureId))
    await tx.delete(conceptEdges).where(eq(conceptEdges.lectureId, lectureId))
    await tx.delete(transcriptSegments).where(eq(transcriptSegments.lectureId, lectureId))
    if (segments.length > 0) {
      await tx.insert(transcriptSegments).values(
        segments.map((s) => ({
          lectureId,
          idx: s.idx,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
        })),
      )
    }
    await tx
      .update(lectures)
      .set({
        hasTimestamps: meta.hasTimestamps,
        durationMs: meta.durationMs,
        ...(meta.sttConfidence === undefined ? {} : { sttConfidence: meta.sttConfidence }),
      })
      .where(eq(lectures.id, lectureId))
    const [row] = await tx
      .select({ courseId: lectures.courseId })
      .from(lectures)
      .where(eq(lectures.id, lectureId))
    if (row) await dropOrphanConcepts(tx as unknown as DbLike, row.courseId)
  })
}

/** Lecture length for scaling (F2.2): measured duration, else last cue, else words ÷ 150. */
export function lectureMinutes(
  lecture: Pick<PipelineLecture, 'durationMs'>,
  segments: readonly LectureSegment[],
): number {
  const lastEnd = segments.at(-1)?.endMs ?? 0
  const ms = lecture.durationMs ?? (lastEnd > 0 ? lastEnd : null)
  if (ms !== null) return ms / 60_000
  return estimateMinutesFromText(segments.map((s) => s.text).join(' '))
}
