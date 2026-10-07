import type { CourseMapResponse, MapNode, SourceRef } from '@lectheo/contracts'
import {
  and,
  asc,
  conceptEdges,
  conceptOccurrences,
  concepts,
  courses,
  desc,
  eq,
  isNull,
  lectures,
  markerConcepts,
  markers,
  sql,
  transcriptSegments,
} from '@lectheo/db'
import type { MasteryResult } from '@lectheo/domain'
import { computeLayout, layoutHash, type Layout } from '@lectheo/domain/layout'
import { conceptsWithUnseenItem } from '../activities/items'
import { excerpt } from '../activities/sources'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { FEATURES } from '../features'
import { type LectureLengthInput, playableWindow } from '../lectures/length'
import { loadMasteryForUser } from '../mastery'
import { loadCourseForRead, type Course } from '../ownership'
import { toAttribution } from './summary'

/*
 * GET /courses/{id}/map (API Spec §4). 8 queries in 3 round trips: the ownership check; then
 * lectures, concepts⋈occurrences, edges, markers⟕marker_concepts, occurrences⋈segments and
 * per-lecture segment times in parallel; then attempts
 * (plus one courses.layout write for a personal course whose graph changed since its layout).
 * 🔒 concepts.key_points is never selected.
 */

type LectureRow = { id: string; hasTimestamps: boolean }
type ConceptRow = { id: string; name: string; summary: string; lectureId: string | null }
type MarkerRow = {
  id: string
  lectureId: string
  kind: 'lost' | 'important'
  tMs: number
  conceptId: string | null
}

const loadLectures = (db: DbLike, courseId: string) =>
  db
    .select({
      id: lectures.id,
      title: lectures.title,
      seq: lectures.seq,
      status: lectures.status,
      hasTimestamps: lectures.hasTimestamps,
      media: lectures.media,
      durationMs: lectures.durationMs,
    })
    .from(lectures)
    .where(eq(lectures.courseId, courseId))
    .orderBy(asc(lectures.seq), asc(lectures.createdAt))

/** One row per (concept, lecture it occurs in), in course order. */
const loadConcepts = (db: DbLike, courseId: string) =>
  db
    .select({
      id: concepts.id,
      name: concepts.name,
      summary: concepts.summary,
      lectureId: conceptOccurrences.lectureId,
    })
    .from(concepts)
    .leftJoin(conceptOccurrences, eq(conceptOccurrences.conceptId, concepts.id))
    .leftJoin(lectures, eq(lectures.id, conceptOccurrences.lectureId))
    .where(eq(concepts.courseId, courseId))
    .orderBy(asc(lectures.seq), asc(concepts.name), asc(concepts.id))

const loadEdges = (db: DbLike, courseId: string) =>
  db
    .select({
      id: conceptEdges.id,
      from: conceptEdges.fromConceptId,
      to: conceptEdges.toConceptId,
      relation: conceptEdges.relation,
    })
    .from(conceptEdges)
    .where(eq(conceptEdges.courseId, courseId))
    .orderBy(asc(conceptEdges.id))

/** This user's live markers in the course, one row per linked concept (null when unlinked). */
const loadMarkers = (db: DbLike, courseId: string, userId: string) =>
  db
    .select({
      id: markers.id,
      lectureId: markers.lectureId,
      kind: markers.kind,
      tMs: markers.tMs,
      conceptId: markerConcepts.conceptId,
    })
    .from(markers)
    .innerJoin(lectures, eq(lectures.id, markers.lectureId))
    .leftJoin(markerConcepts, eq(markerConcepts.markerId, markers.id))
    .where(
      and(eq(lectures.courseId, courseId), eq(markers.userId, userId), isNull(markers.deletedAt)),
    )
    .orderBy(asc(markers.lectureId), asc(markers.tMs))

/** Per-node cap on source moments (F2.4), like activity feedback's (activities/sources.ts). */
const NODE_SOURCES = 3

/**
 * Every transcript segment an occurrence cites, for all of the course's concepts in one query (no
 * per-node lookups), most salient occurrence first. ponytail: rows past the cap are dropped in
 * JS; a window function can cap in SQL if a course ever cites thousands of segments.
 */
const loadSources = (db: DbLike, courseId: string) =>
  db
    .select({
      conceptId: conceptOccurrences.conceptId,
      lectureId: transcriptSegments.lectureId,
      idx: transcriptSegments.idx,
      startMs: transcriptSegments.startMs,
      text: transcriptSegments.text,
      editedText: transcriptSegments.editedText,
    })
    .from(conceptOccurrences)
    .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
    .innerJoin(lectures, eq(lectures.id, conceptOccurrences.lectureId))
    .innerJoin(
      transcriptSegments,
      and(
        eq(transcriptSegments.lectureId, conceptOccurrences.lectureId),
        sql`${transcriptSegments.idx} = ANY(${conceptOccurrences.segmentIdxs})`,
      ),
    )
    .where(eq(concepts.courseId, courseId))
    .orderBy(desc(conceptOccurrences.salience), asc(lectures.seq), asc(transcriptSegments.idx))

/**
 * Per lecture: its last segment's end and its chapters' start times (F2.11), in one pass over the
 * course's segments.
 */
const loadSegmentTimes = (db: DbLike, courseId: string) =>
  db
    .select({
      lectureId: lectures.id,
      lastEndMs: sql<number>`max(${transcriptSegments.endMs})`,
      chapterStartsMs: sql<number[] | null>`array_agg(${transcriptSegments.startMs}
        ORDER BY ${transcriptSegments.idx}) FILTER (WHERE ${transcriptSegments.idx} IN
        (SELECT (c->>'startIdx')::int FROM jsonb_array_elements(${lectures.chapters}) c))`,
    })
    .from(transcriptSegments)
    .innerJoin(lectures, eq(lectures.id, transcriptSegments.lectureId))
    .where(eq(lectures.courseId, courseId))
    .groupBy(lectures.id)

type SegmentTimes = Awaited<ReturnType<typeof loadSegmentTimes>>[number]

/** The timeline's axis for one lecture (F2.11), in media time; none without timestamps. */
export function lectureTimes(
  lecture: LectureLengthInput & { hasTimestamps: boolean },
  segments: Pick<SegmentTimes, 'lastEndMs' | 'chapterStartsMs'> | undefined,
): { startMs: number; durationMs: number | null; chapterStartsMs: number[] } {
  if (!lecture.hasTimestamps) return { startMs: 0, durationMs: null, chapterStartsMs: [] }
  const window = playableWindow(lecture, segments?.lastEndMs ?? null)
  return { ...window, chapterStartsMs: segments?.chapterStartsMs ?? [] }
}

type SourceRow = Awaited<ReturnType<typeof loadSources>>[number]

function sourcesByConcept(rows: SourceRow[]): Map<string, SourceRef[]> {
  const byConcept = new Map<string, SourceRef[]>()
  for (const { conceptId, lectureId, idx, startMs, text, editedText } of rows) {
    const refs = byConcept.get(conceptId) ?? []
    if (refs.length >= NODE_SOURCES) continue
    byConcept.set(conceptId, [
      ...refs,
      { lectureId, idx, startMs, excerpt: excerpt(editedText ?? text) },
    ])
  }
  return byConcept
}

interface ConceptNode {
  id: string
  name: string
  summary: string
  lectureIds: string[]
}

/** Concepts with their lectureIds (first occurrence first), in first-appearance order. */
function groupConcepts(rows: ConceptRow[]): Map<string, ConceptNode> {
  const grouped = new Map<string, ConceptNode>()
  for (const { lectureId, ...concept } of rows) {
    const node = grouped.get(concept.id) ?? { ...concept, lectureIds: [] }
    if (lectureId && !node.lectureIds.includes(lectureId)) node.lectureIds.push(lectureId)
    grouped.set(concept.id, node)
  }
  return grouped
}

type Moment = MapNode['moments'][number]

function momentsByConcept(rows: MarkerRow[]): Map<string, Moment[]> {
  const byConcept = new Map<string, Moment[]>()
  for (const { conceptId, ...moment } of rows) {
    if (!conceptId) continue
    byConcept.set(conceptId, [...(byConcept.get(conceptId) ?? []), moment])
  }
  return byConcept
}

const countKind = (moments: readonly Moment[], kind: Moment['kind']) =>
  moments.filter((m) => m.kind === kind).length

/**
 * courses.layout. Library courses use the seed's layout as-is: library content is never written at
 * runtime (Data Model §6 invariant 7). Personal courses recompute and store it when missing or the
 * graph changed (layout_hash differs), with a guarded update so concurrent reads write it once. A
 * layout failure never fails the map: it falls back to the stale layout (the canvas grids unplaced
 * nodes).
 */
async function ensureLayout(
  db: DbLike,
  course: Course,
  conceptIds: string[],
  edges: Awaited<ReturnType<typeof loadEdges>>,
): Promise<Layout> {
  if (course.kind === 'library') return course.layout ?? {}
  const concepts = conceptIds.map((id) => ({ id }))
  const hash = layoutHash(concepts, edges)
  if (course.layout && course.layoutHash === hash) return course.layout
  try {
    const layout = await computeLayout(concepts, edges)
    await db
      .update(courses)
      .set({ layout, layoutHash: hash })
      .where(and(eq(courses.id, course.id), sql`${courses.layoutHash} IS DISTINCT FROM ${hash}`))
    return layout
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(JSON.stringify({ event: 'layout_failed', courseId: course.id, reason }))
    return course.layout ?? {}
  }
}

const GRAY: MasteryResult = { state: 'gray', confidentMistake: false, reasons: [] }

export async function getCourseMap(
  actor: Actor,
  courseId: string,
  db: DbLike = appDb(),
): Promise<CourseMapResponse> {
  const course: Course = await loadCourseForRead(actor, courseId, db)
  const [lectureRows, conceptRows, edges, markerRows, sourceRows, segmentTimes] = await Promise.all(
    [
      loadLectures(db, course.id),
      loadConcepts(db, course.id),
      loadEdges(db, course.id),
      loadMarkers(db, course.id, actor.userId),
      loadSources(db, course.id),
      loadSegmentTimes(db, course.id),
    ],
  )
  const timesByLecture = new Map(segmentTimes.map((t) => [t.lectureId, t]))
  const grouped = groupConcepts(conceptRows)
  const mastery = await loadMasteryForUser(db, actor.userId, [...grouped.keys()])
  const moments = momentsByConcept(markerRows)
  const sources = sourcesByConcept(sourceRows)
  const layout = await ensureLayout(db, course, [...grouped.keys()], edges)
  const transfer = FEATURES.transfer
    ? await conceptsWithUnseenItem(db, actor.userId, [...grouped.keys()], 'transfer')
    : new Set<string>()

  const nodes: MapNode[] = [...grouped.values()].map((c) => {
    const m = mastery.get(c.id) ?? GRAY
    const pos = layout[c.id]
    const own = moments.get(c.id) ?? []
    return {
      ...c,
      mastery: { state: m.state, confidentMistake: m.confidentMistake, reasons: [...m.reasons] },
      markers: { lost: countKind(own, 'lost'), important: countKind(own, 'important') },
      moments: own,
      sources: sources.get(c.id) ?? [],
      position: pos ? { x: pos.x, y: pos.y } : null,
      transferAvailable: transfer.has(c.id),
    }
  })

  return {
    course: {
      id: course.id,
      title: course.title,
      kind: course.kind,
      attribution: toAttribution(course.attribution),
    },
    lectures: lectureRows.map(({ media, durationMs, ...l }) => ({
      ...l,
      ...lectureTimes({ ...l, media, durationMs }, timesByLecture.get(l.id)),
    })),
    nodes,
    edges,
    unlinkedMarkers: unlinked(markerRows, lectureRows),
  }
}

/** Markers no concept claimed, on lectures with timestamps (text-only imports can't align). */
function unlinked(
  rows: MarkerRow[],
  lectureRows: LectureRow[],
): CourseMapResponse['unlinkedMarkers'] {
  const timed = new Set(lectureRows.filter((l) => l.hasTimestamps).map((l) => l.id))
  return rows
    .filter((m) => m.conceptId === null && timed.has(m.lectureId))
    .map(({ id, lectureId, kind, tMs }) => ({ id, lectureId, kind, tMs }))
}
