import type {
  BriefConcept,
  BriefResponse,
  KeyPoints,
  LectureChapter,
  SourceRef,
} from '@lectheo/contracts'
import {
  and,
  asc,
  conceptEdges,
  conceptOccurrences,
  concepts,
  eq,
  inArray,
  or,
  transcriptSegments,
} from '@lectheo/db'
import { briefReadMinutes, clipMs, learningOrder, mergeClips } from '@lectheo/domain'
import { excerpt } from '../activities/sources'
import type { Actor } from '../auth'
import { watchMs } from '../courses/next'
import { appDb, type DbLike } from '../db'
import { markerCountsByConcept } from '../diagnostic/shared'
import { invalidState } from '../errors'
import { loadMasteryForUser } from '../mastery'
import { type Lecture, loadLectureForRead } from '../ownership'
import { lectureChapters } from './read'

/*
 * GET /lectures/{id}/brief (Product Spec F9, API Spec §5). Built from the stored map only: no AI
 * calls (F9.9). Key points are shown to students since ADR-009 was amended (F9.8); nothing else
 * secret is selected. The ownership check, then 5 queries in parallel, then attempts for mastery
 * (plus one query when key points cite another lecture).
 */

const MAP_STATUSES: readonly Lecture['status'][] = ['map_ready', 'ready']
const KEY_POINT_SOURCES = 3
const MS_PER_MINUTE = 60_000

interface SegmentRow {
  lectureId: string
  idx: number
  startMs: number
  endMs: number
  text: string
  editedText: string | null
}

/** The lecture's concepts with their occurrence in it (one row per concept). */
const loadConcepts = (db: DbLike, lectureId: string) =>
  db
    .select({
      id: concepts.id,
      name: concepts.name,
      summary: concepts.summary,
      keyPoints: concepts.keyPoints,
      firstLectureId: concepts.firstLectureId,
      segmentIdxs: conceptOccurrences.segmentIdxs,
    })
    .from(conceptOccurrences)
    .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
    .where(eq(conceptOccurrences.lectureId, lectureId))

type ConceptRow = Awaited<ReturnType<typeof loadConcepts>>[number]

const segmentColumns = {
  lectureId: transcriptSegments.lectureId,
  idx: transcriptSegments.idx,
  startMs: transcriptSegments.startMs,
  endMs: transcriptSegments.endMs,
  text: transcriptSegments.text,
  editedText: transcriptSegments.editedText,
}

const loadSegments = (db: DbLike, lectureId: string): Promise<SegmentRow[]> =>
  db
    .select(segmentColumns)
    .from(transcriptSegments)
    .where(eq(transcriptSegments.lectureId, lectureId))
    .orderBy(asc(transcriptSegments.idx))

/** The course's depends_on edges with the prerequisite's name. */
const loadPrerequisites = (db: DbLike, courseId: string) =>
  db
    .select({ from: conceptEdges.fromConceptId, id: concepts.id, name: concepts.name })
    .from(conceptEdges)
    .innerJoin(concepts, eq(concepts.id, conceptEdges.toConceptId))
    .where(and(eq(conceptEdges.courseId, courseId), eq(conceptEdges.relation, 'depends_on')))
    .orderBy(asc(concepts.name))

/**
 * Key points cite the segments of the concept's first lecture, which for a concept met again here
 * is another lecture: those segments are loaded in one extra query.
 */
async function loadCitedElsewhere(
  db: DbLike,
  lectureId: string,
  rows: readonly ConceptRow[],
): Promise<SegmentRow[]> {
  const byLecture = new Map<string, Set<number>>()
  for (const c of rows) {
    if (!c.firstLectureId || c.firstLectureId === lectureId) continue
    const idxs = byLecture.get(c.firstLectureId) ?? new Set<number>()
    c.keyPoints.forEach((k) => k.segmentIdxs.forEach((i) => idxs.add(i)))
    byLecture.set(c.firstLectureId, idxs)
  }
  if (byLecture.size === 0) return []
  return db
    .select(segmentColumns)
    .from(transcriptSegments)
    .where(
      or(
        ...[...byLecture].map(([id, idxs]) =>
          and(eq(transcriptSegments.lectureId, id), inArray(transcriptSegments.idx, [...idxs])),
        ),
      ),
    )
}

const segmentKey = (lectureId: string, idx: number): string => `${lectureId}:${idx}`

function keyPointsWithSources(
  keyPoints: KeyPoints,
  lectureId: string,
  segments: ReadonlyMap<string, SegmentRow>,
): BriefConcept['keyPoints'] {
  return keyPoints.map(({ id, text, segmentIdxs }) => ({
    id,
    text,
    sources: segmentIdxs
      .flatMap((idx): SourceRef[] => {
        const s = segments.get(segmentKey(lectureId, idx))
        return s
          ? [{ lectureId, idx, startMs: s.startMs, excerpt: excerpt(s.editedText ?? s.text) }]
          : []
      })
      .slice(0, KEY_POINT_SOURCES),
  }))
}

/** The chapter that lists the concept, else the one its first moment falls in (F11.5). */
function chapterOf(
  chapters: readonly LectureChapter[],
  conceptId: string,
  firstMs: number | undefined,
): BriefConcept['chapter'] {
  const chapter =
    chapters.find((c) => c.conceptIds.includes(conceptId)) ??
    (firstMs === undefined
      ? undefined
      : chapters.find((c) => c.startMs <= firstMs && firstMs <= c.endMs))
  return chapter ? { id: chapter.id, title: chapter.title, startMs: chapter.startMs } : null
}

/** Minutes of video to watch; null without playable media (pasted transcripts, audio). */
function videoMinutes(lecture: Lecture): number | null {
  const playable =
    lecture.source === 'library' || lecture.source === 'import' || lecture.source === 'youtube'
  const ms = playable && lecture.hasTimestamps ? watchMs(lecture) : null
  return ms === null ? null : Math.round(ms / MS_PER_MINUTE)
}

export async function getBrief(
  actor: Actor,
  lectureId: string,
  db: DbLike = appDb(),
): Promise<BriefResponse> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  if (!MAP_STATUSES.includes(lecture.status)) {
    throw invalidState('The study brief is ready once the concept map is built.')
  }
  const [rows, segments, prerequisites, marks, chapters] = await Promise.all([
    loadConcepts(db, lecture.id),
    loadSegments(db, lecture.id),
    loadPrerequisites(db, lecture.courseId),
    markerCountsByConcept(db, actor.userId, lecture.id),
    lectureChapters(db, lecture),
  ])
  const [elsewhere, mastery] = await Promise.all([
    loadCitedElsewhere(db, lecture.id, rows),
    loadMasteryForUser(
      db,
      actor.userId,
      rows.map((c) => c.id),
    ),
  ])
  const bySegment = new Map(
    [...segments, ...elsewhere].map((s) => [segmentKey(s.lectureId, s.idx), s]),
  )
  const order = learningOrder(
    rows.map((c) => ({ id: c.id, firstIdx: Math.min(...c.segmentIdxs) })),
    prerequisites.map((p) => ({ from: p.from, to: p.id, relation: 'depends_on' })),
  )
  const byId = new Map(rows.map((c) => [c.id, c]))

  const briefConcepts = order.flatMap((id): BriefConcept[] => {
    const c = byId.get(id)
    if (!c) return []
    const clips = mergeClips(segments, c.segmentIdxs)
    const m = mastery.get(c.id)
    const counts = marks.get(c.id)
    return [
      {
        id: c.id,
        name: c.name,
        mastery: { state: m?.state ?? 'gray', confidentMistake: m?.confidentMistake ?? false },
        prerequisites: prerequisites
          .filter((p) => p.from === c.id)
          .map((p) => ({ id: p.id, name: p.name })),
        summary: c.summary,
        keyPoints: keyPointsWithSources(c.keyPoints, c.firstLectureId ?? lecture.id, bySegment),
        clips,
        clipMs: clipMs(clips),
        chapter: chapterOf(chapters, c.id, clips[0]?.startMs),
        marks: { lost: counts?.lostCount ?? 0, important: counts?.importantCount ?? 0 },
      },
    ]
  })

  return {
    lectureId: lecture.id,
    readMinutes: briefReadMinutes(briefConcepts),
    videoMinutes: videoMinutes(lecture),
    concepts: briefConcepts,
  }
}
