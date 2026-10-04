import type { ListMarkersResponse, MarkerInput, PostMarkersResponse } from '@lectheo/contracts'
import {
  and,
  asc,
  conceptOccurrences,
  eq,
  isNull,
  markerConcepts,
  markers,
  sql,
  transcriptSegments,
} from '@lectheo/db'
import { alignMarkers } from '@lectheo/domain'
import { z } from 'zod'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { invalidState, notFound } from '../errors'
import { type Lecture, loadLectureForRead } from '../ownership'

/*
 * /lectures/{id}/markers (API Spec §5, F1.1–F1.4, F2.3). Markers are per user: library lectures
 * are readable by everyone, but every query is scoped to the caller's user id.
 */

type PostMarkersDto = z.input<typeof PostMarkersResponse>
type ListMarkersDto = z.input<typeof ListMarkersResponse>
type InsertedMarker = Pick<MarkerInput, 'id' | 'kind' | 'tMs'>

/** Lectures whose concepts already exist, so markers are aligned on write (Arch §6.1). */
const ALIGNED_STATUSES: readonly Lecture['status'][] = ['map_ready', 'ready']

/**
 * POST /lectures/{id}/markers: batch insert, `ON CONFLICT (id) DO NOTHING` so a resent batch is
 * safe (ADR-007). Newly inserted markers on processed lectures are linked to concepts now.
 */
export async function postMarkers(
  actor: Actor,
  lectureId: string,
  input: readonly MarkerInput[],
  db: DbLike = appDb(),
): Promise<PostMarkersDto> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  if (!lecture.hasTimestamps) {
    throw invalidState('This lecture has no timestamps, so markers can’t be placed.')
  }

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(markers)
      .values(
        input.map((m) => ({
          id: m.id,
          lectureId: lecture.id,
          userId: actor.userId,
          kind: m.kind,
          tMs: m.tMs,
          capture: m.capture,
        })),
      )
      .onConflictDoNothing({ target: markers.id })
      .returning({ id: markers.id, kind: markers.kind, tMs: markers.tMs })

    if (inserted.length > 0 && ALIGNED_STATUSES.includes(lecture.status)) {
      await alignOnWrite(tx as unknown as DbLike, lecture.id, inserted)
    }
    return { accepted: inserted.length, duplicates: input.length - inserted.length }
  })
}

async function alignOnWrite(
  db: DbLike,
  lectureId: string,
  inserted: readonly InsertedMarker[],
): Promise<void> {
  // ponytail: loads all of the lecture's segments (~300 rows for 3 h); fine per 10 s batch.
  const segments = await db
    .select({
      idx: transcriptSegments.idx,
      startMs: transcriptSegments.startMs,
      endMs: transcriptSegments.endMs,
    })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.lectureId, lectureId))
  const occurrences = await db
    .select({
      conceptId: conceptOccurrences.conceptId,
      segmentIdxs: conceptOccurrences.segmentIdxs,
    })
    .from(conceptOccurrences)
    .where(eq(conceptOccurrences.lectureId, lectureId))

  const links = alignMarkers(
    inserted.map((m) => ({ markerId: m.id, kind: m.kind, tMs: m.tMs })),
    segments,
    occurrences,
  ).flatMap(({ markerId, conceptId, overlapScore }) =>
    conceptId ? [{ markerId, conceptId, overlapScore }] : [],
  )
  if (links.length > 0) await db.insert(markerConcepts).values(links).onConflictDoNothing()
}

/** GET /lectures/{id}/markers: the caller's live markers in time order, with linked concepts. */
export async function listMarkers(
  actor: Actor,
  lectureId: string,
  db: DbLike = appDb(),
): Promise<ListMarkersDto> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  const rows = await db
    .select({
      id: markers.id,
      kind: markers.kind,
      tMs: markers.tMs,
      capture: markers.capture,
      conceptId: markerConcepts.conceptId,
    })
    .from(markers)
    .leftJoin(markerConcepts, eq(markerConcepts.markerId, markers.id))
    .where(
      and(
        eq(markers.lectureId, lecture.id),
        eq(markers.userId, actor.userId),
        isNull(markers.deletedAt),
      ),
    )
    .orderBy(asc(markers.tMs), asc(markers.id))

  const byId = new Map<string, ListMarkersDto['data'][number]>()
  for (const { conceptId, ...marker } of rows) {
    const dto = byId.get(marker.id) ?? { ...marker, conceptIds: [] }
    byId.set(marker.id, conceptId ? { ...dto, conceptIds: [...dto.conceptIds, conceptId] } : dto)
  }
  return { data: [...byId.values()] }
}

const isUuid = (id: string): boolean => z.uuid().safeParse(id).success

/**
 * DELETE /lectures/{id}/markers/{markerId}: undo (soft delete). Repeating it is a no-op 204;
 * unknown ids and other users' markers are 404.
 */
export async function deleteMarker(
  actor: Actor,
  lectureId: string,
  markerId: string,
  db: DbLike = appDb(),
): Promise<void> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  if (!isUuid(markerId)) throw notFound()
  const [row] = await db
    .update(markers)
    .set({ deletedAt: sql`coalesce(${markers.deletedAt}, now())` })
    .where(
      and(
        eq(markers.id, markerId),
        eq(markers.lectureId, lecture.id),
        eq(markers.userId, actor.userId),
      ),
    )
    .returning({ id: markers.id })
  if (!row) throw notFound()
}
