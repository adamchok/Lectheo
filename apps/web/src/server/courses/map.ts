import type { CourseMapResponse, MapNode } from '@lectheo/contracts'
import {
  and,
  asc,
  conceptEdges,
  conceptOccurrences,
  concepts,
  courses,
  eq,
  isNull,
  lectures,
  markerConcepts,
  markers,
  sql,
} from '@lectheo/db'
import type { MasteryResult } from '@lectheo/domain'
import { computeLayout, layoutHash, type Layout } from '@lectheo/domain/layout'
import { conceptsWithUnseenItem } from '../activities/items'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { FEATURES } from '../features'
import { loadMasteryForUser } from '../mastery'
import { loadCourseForRead, type Course } from '../ownership'
import { toAttribution } from './summary'

/*
 * GET /courses/{id}/map (API Spec §4). 6 queries in 3 round trips: the ownership check; then
 * lectures, concepts⋈occurrences, edges and markers⟕marker_concepts in parallel; then attempts
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
  const [lectureRows, conceptRows, edges, markerRows] = await Promise.all([
    loadLectures(db, course.id),
    loadConcepts(db, course.id),
    loadEdges(db, course.id),
    loadMarkers(db, course.id, actor.userId),
  ])
  const grouped = groupConcepts(conceptRows)
  const mastery = await loadMasteryForUser(db, actor.userId, [...grouped.keys()])
  const moments = momentsByConcept(markerRows)
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
    lectures: lectureRows,
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
