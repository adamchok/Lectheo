import type {
  BriefConcept,
  BriefDepth,
  BriefResponse,
  ConceptDepth,
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
import {
  briefReadMinutes,
  byChapter,
  clipMs,
  depthTexts,
  learningOrder,
  mergeClips,
  readMinutes,
} from '@lectheo/domain'
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
 * GET /lectures/{id}/brief (Product Spec F9, API Spec §5). Built from the stored map and the
 * pipeline's stored depth only: no AI calls here. Key points (F9.8) and depth (F9.13) are shown to
 * students; nothing secret is selected. The ownership check, then 6 queries in parallel, then
 * attempts for mastery (plus one query when key points or depth cite another lecture).
 */

const MAP_STATUSES: readonly Lecture['status'][] = ['map_ready', 'ready']
const MAX_SOURCES = 3
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
      depth: concepts.depth,
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

interface EdgeEnd {
  /** The concept the edge is read from. */
  of: string
  id: string
  name: string
}

/** The course's depends_on edges, read from the dependent side: `of` builds on `id`. */
const loadPrerequisites = (db: DbLike, courseId: string): Promise<EdgeEnd[]> =>
  db
    .select({ of: conceptEdges.fromConceptId, id: concepts.id, name: concepts.name })
    .from(conceptEdges)
    .innerJoin(concepts, eq(concepts.id, conceptEdges.toConceptId))
    .where(and(eq(conceptEdges.courseId, courseId), eq(conceptEdges.relation, 'depends_on')))
    .orderBy(asc(concepts.name))

/** The same edges read from the prerequisite's side: `id` builds on `of` (F9.13 "leads to"). */
const loadDependents = (db: DbLike, courseId: string): Promise<EdgeEnd[]> =>
  db
    .select({ of: conceptEdges.toConceptId, id: concepts.id, name: concepts.name })
    .from(conceptEdges)
    .innerJoin(concepts, eq(concepts.id, conceptEdges.fromConceptId))
    .where(and(eq(conceptEdges.courseId, courseId), eq(conceptEdges.relation, 'depends_on')))
    .orderBy(asc(concepts.name))

/** Segment indexes a concept's key points and depth cite (in its first lecture). */
const citedIdxs = (c: ConceptRow): number[] => [
  ...c.keyPoints.flatMap((k) => k.segmentIdxs),
  ...(c.depth?.howItWorks.flatMap((p) => p.cites) ?? []),
]

/**
 * Key points and depth cite the segments of the concept's first lecture, which for a concept met
 * again here is another lecture: those segments are loaded in one extra query.
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
    citedIdxs(c).forEach((i) => idxs.add(i))
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

/** Segment citations → "▶ 12:41" links (at most 3), skipping segments that no longer exist. */
function sourcesOf(
  idxs: readonly number[],
  lectureId: string,
  segments: ReadonlyMap<string, SegmentRow>,
): SourceRef[] {
  return idxs
    .flatMap((idx): SourceRef[] => {
      const s = segments.get(segmentKey(lectureId, idx))
      return s
        ? [{ lectureId, idx, startMs: s.startMs, excerpt: excerpt(s.editedText ?? s.text) }]
        : []
    })
    .slice(0, MAX_SOURCES)
}

const keyPointsWithSources = (
  keyPoints: KeyPoints,
  lectureId: string,
  segments: ReadonlyMap<string, SegmentRow>,
): BriefConcept['keyPoints'] =>
  keyPoints.map(({ id, text, segmentIdxs }) => ({
    id,
    text,
    sources: sourcesOf(segmentIdxs, lectureId, segments),
  }))

/** F9.13: stored depth with lecture links and the map's builds-on / leads-to concepts. */
function briefDepth(
  depth: ConceptDepth | null,
  lectureId: string,
  segments: ReadonlyMap<string, SegmentRow>,
  connects: BriefDepth['connects'],
): BriefDepth | null {
  if (!depth) return null
  return {
    howItWorks: depth.howItWorks.map((p) => ({
      text: p.text,
      sources: sourcesOf(p.cites, lectureId, segments),
    })),
    example: depth.example,
    mistakes: depth.mistakes,
    connects,
    readMinutes: readMinutes(depthTexts(depth)),
  }
}

const chapterRef = (chapter: LectureChapter | undefined): BriefConcept['chapter'] =>
  chapter ? { id: chapter.id, title: chapter.title, startMs: chapter.startMs } : null

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
  const [rows, segments, prerequisites, dependents, marks, chapters] = await Promise.all([
    loadConcepts(db, lecture.id),
    loadSegments(db, lecture.id),
    loadPrerequisites(db, lecture.courseId),
    loadDependents(db, lecture.courseId),
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
    prerequisites.map((p) => ({ from: p.of, to: p.id, relation: 'depends_on' })),
  )
  const byId = new Map(rows.map((c) => [c.id, c]))
  const clipsOf = new Map(rows.map((c) => [c.id, mergeClips(segments, c.segmentIdxs)]))
  const placements = byChapter(
    order.map((id) => ({ id, momentsMs: (clipsOf.get(id) ?? []).map((clip) => clip.startMs) })),
    chapters,
  )
  const chapterById = new Map(chapters.map((ch) => [ch.id, ch]))
  const ends = (list: readonly EdgeEnd[], id: string) =>
    list.filter((e) => e.of === id).map(({ id: endId, name }) => ({ id: endId, name }))

  const briefConcepts = placements.flatMap(({ id, chapterId, alsoIn }): BriefConcept[] => {
    const c = byId.get(id)
    if (!c) return []
    const clips = clipsOf.get(id) ?? []
    const m = mastery.get(id)
    const counts = marks.get(id)
    const builtOn = ends(prerequisites, id)
    const citedIn = c.firstLectureId ?? lecture.id
    return [
      {
        id,
        name: c.name,
        mastery: { state: m?.state ?? 'gray', confidentMistake: m?.confidentMistake ?? false },
        prerequisites: builtOn,
        summary: c.summary,
        keyPoints: keyPointsWithSources(c.keyPoints, citedIn, bySegment),
        clips,
        clipMs: clipMs(clips),
        chapter: chapterRef(chapterId ? chapterById.get(chapterId) : undefined),
        marks: { lost: counts?.lostCount ?? 0, important: counts?.importantCount ?? 0 },
        depth: briefDepth(c.depth, citedIn, bySegment, [
          ...builtOn.map((e) => ({ ...e, relation: 'builds_on' as const })),
          ...ends(dependents, id).map((e) => ({ ...e, relation: 'leads_to' as const })),
        ]),
        alsoIn: [...alsoIn],
      },
    ]
  })

  return {
    lectureId: lecture.id,
    readMinutes: briefReadMinutes(briefConcepts),
    depthMinutes: readMinutes(rows.flatMap((c) => (c.depth ? depthTexts(c.depth) : []))),
    videoMinutes: videoMinutes(lecture),
    concepts: briefConcepts,
  }
}
