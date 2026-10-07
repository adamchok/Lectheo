import type {
  ListMarkersResponse,
  MarkerBody,
  MarkerInput,
  PostMarkersResponse,
  StudyTarget,
} from '@lectheo/contracts'
import {
  and,
  asc,
  conceptOccurrences,
  eq,
  inArray,
  isNull,
  markerConcepts,
  markers,
  min,
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

type StudyBody = Exclude<MarkerBody, MarkerInput>

const isStudy = (m: MarkerBody): m is StudyBody => m.capture === 'study'

interface PlacedMarker extends InsertedMarker {
  capture: MarkerBody['capture']
  /** Study marks name their concepts (linked directly, overlap 1); null = align by time. */
  conceptIds: readonly string[] | null
  target: StudyTarget | null
}

/** Each concept's first source moment in this lecture (F9.4). One query. */
async function firstMoments(
  db: DbLike,
  lectureId: string,
  conceptIds: readonly string[],
): Promise<Map<string, number>> {
  if (conceptIds.length === 0) return new Map()
  const rows = await db
    .select({ conceptId: conceptOccurrences.conceptId, tMs: min(transcriptSegments.startMs) })
    .from(conceptOccurrences)
    .innerJoin(
      transcriptSegments,
      and(
        eq(transcriptSegments.lectureId, conceptOccurrences.lectureId),
        sql`${transcriptSegments.idx} = ANY(${conceptOccurrences.segmentIdxs})`,
      ),
    )
    .where(
      and(
        eq(conceptOccurrences.lectureId, lectureId),
        inArray(conceptOccurrences.conceptId, [...conceptIds]),
      ),
    )
    .groupBy(conceptOccurrences.conceptId)
  return new Map(rows.flatMap((r) => (r.tMs === null ? [] : [[r.conceptId, r.tMs] as const])))
}

/** Chapter id → its start time and concepts (F11.4). One query. */
async function chapterStarts(
  db: DbLike,
  lecture: Lecture,
): Promise<Map<string, { tMs: number; conceptIds: string[] }>> {
  const chapters = lecture.chapters ?? []
  if (chapters.length === 0) return new Map()
  const rows = await db
    .select({ idx: transcriptSegments.idx, startMs: transcriptSegments.startMs })
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.lectureId, lecture.id),
        inArray(
          transcriptSegments.idx,
          chapters.map((c) => c.startIdx),
        ),
      ),
    )
  const startOf = new Map(rows.map((r) => [r.idx, r.startMs]))
  return new Map(
    chapters.flatMap((c) => {
      const tMs = startOf.get(c.startIdx)
      return tMs === undefined ? [] : [[c.id, { tMs, conceptIds: c.conceptIds }] as const]
    }),
  )
}

/**
 * Study marks get their time and concepts from the server: a concept mark sits at the concept's
 * first source moment, a chapter mark at the chapter's start (F9.4, F11.4). An unknown concept or
 * chapter, or a chapter without concepts, is a 404.
 */
async function placeMarkers(
  db: DbLike,
  lecture: Lecture,
  input: readonly MarkerBody[],
): Promise<PlacedMarker[]> {
  const study = input.filter(isStudy)
  const conceptIds = study.flatMap((m) => ('conceptId' in m ? [m.conceptId] : []))
  const [moments, chapters] = await Promise.all([
    firstMoments(db, lecture.id, conceptIds),
    study.some((m) => 'chapterId' in m) ? chapterStarts(db, lecture) : new Map<string, never>(),
  ])
  return input.map((m): PlacedMarker => {
    if (!isStudy(m)) return { ...m, conceptIds: null, target: null }
    if ('conceptId' in m) {
      const tMs = moments.get(m.conceptId)
      if (tMs === undefined) throw notFound()
      const target = { conceptId: m.conceptId }
      return { id: m.id, kind: m.kind, capture: 'study', tMs, conceptIds: [m.conceptId], target }
    }
    const chapter = chapters.get(m.chapterId)
    if (!chapter || chapter.conceptIds.length === 0) throw notFound()
    const target = { chapterId: m.chapterId }
    return { id: m.id, kind: m.kind, capture: 'study', ...chapter, target }
  })
}

/**
 * POST /lectures/{id}/markers: batch insert, `ON CONFLICT (id) DO NOTHING` so a resent batch is
 * safe (ADR-007). Newly inserted watch markers on processed lectures are aligned to concepts now;
 * study marks are linked straight to the concepts they name.
 */
export async function postMarkers(
  actor: Actor,
  lectureId: string,
  input: readonly MarkerBody[],
  db: DbLike = appDb(),
): Promise<PostMarkersDto> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  if (!lecture.hasTimestamps) {
    throw invalidState('This lecture has no timestamps, so markers can’t be placed.')
  }
  const placed = await placeMarkers(db, lecture, input)

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(markers)
      .values(
        placed.map((m) => ({
          id: m.id,
          lectureId: lecture.id,
          userId: actor.userId,
          kind: m.kind,
          tMs: m.tMs,
          capture: m.capture,
          target: m.target,
        })),
      )
      .onConflictDoNothing({ target: markers.id })
      .returning({ id: markers.id, kind: markers.kind, tMs: markers.tMs })

    const fresh = new Map(
      placed.filter((m) => inserted.some((i) => i.id === m.id)).map((m) => [m.id, m]),
    )
    const links = [...fresh.values()].flatMap((m) =>
      (m.conceptIds ?? []).map((conceptId) => ({ markerId: m.id, conceptId, overlapScore: 1 })),
    )
    if (links.length > 0) await tx.insert(markerConcepts).values(links).onConflictDoNothing()
    const toAlign = inserted.filter((m) => fresh.get(m.id)?.conceptIds === null)
    if (toAlign.length > 0 && ALIGNED_STATUSES.includes(lecture.status)) {
      await alignOnWrite(tx as unknown as DbLike, lecture.id, toAlign)
    }
    return { accepted: inserted.length, duplicates: input.length - inserted.length }
  })
}

/** Links newly written markers to this lecture's concepts (also the pipeline's alignMarkers). */
export async function alignOnWrite(
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

export interface StudyMark {
  id: string
  tMs: number
  target: StudyTarget | null
}

/**
 * Re-links study marks after a re-run (the pipeline's alignMarkers): they are never aligned by
 * time. A concept mark keeps its concept while the lecture still teaches it; a chapter mark goes
 * to the chapter that now starts at its time (else the one with its old id), and its target
 * follows that chapter. Callers delete the marks' old links first.
 */
export async function relinkStudyMarks(
  db: DbLike,
  lecture: Lecture,
  marks: readonly StudyMark[],
): Promise<void> {
  if (marks.length === 0) return
  const [occurring, chapters] = await Promise.all([
    db
      .select({ conceptId: conceptOccurrences.conceptId })
      .from(conceptOccurrences)
      .where(eq(conceptOccurrences.lectureId, lecture.id)),
    chapterStarts(db, lecture),
  ])
  const taught = new Set(occurring.map((o) => o.conceptId))
  const links: { markerId: string; conceptId: string; overlapScore: number }[] = []
  for (const m of marks) {
    if (m.target && 'conceptId' in m.target) {
      if (taught.has(m.target.conceptId)) {
        links.push({ markerId: m.id, conceptId: m.target.conceptId, overlapScore: 1 })
      }
      continue
    }
    const oldId = m.target && 'chapterId' in m.target ? m.target.chapterId : null
    const match =
      [...chapters].find(([, c]) => c.tMs === m.tMs) ?? [...chapters].find(([id]) => id === oldId)
    if (!match) continue
    const [chapterId, chapter] = match
    links.push(
      ...chapter.conceptIds.map((conceptId) => ({ markerId: m.id, conceptId, overlapScore: 1 })),
    )
    if (chapterId !== oldId) {
      await db.update(markers).set({ target: { chapterId } }).where(eq(markers.id, m.id))
    }
  }
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
      target: markers.target,
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
