import { extractConceptsTask, runTask, type ExtractConceptsOutput } from '@lectheo/ai'
import {
  and,
  conceptEdges,
  conceptOccurrences,
  concepts,
  courses,
  eq,
  inArray,
  isNull,
  lectures,
  markerConcepts,
  markers,
  sql,
  uuidv7,
} from '@lectheo/db'
import { chapterCountRange, scaleForMinutes, type ChapterRange } from '@lectheo/domain'
import { computeLayout, layoutHash } from '@lectheo/domain/layout'
import { aiContext } from '../ai-hooks'
import type { DbLike } from '../db'
import { alignOnWrite } from '../lectures/markers'
import {
  cycleErrors,
  graphErrors,
  nodeId,
  planChapters,
  planGraph,
  type CourseConcept,
  type CourseEdge,
  type GraphPlan,
} from './graph-check'
import {
  lectureMinutes,
  loadLecture,
  loadSegments,
  spokenMinutes,
  type PipelineLecture,
} from './segments'
import { PipelineError, runStep, stepOutput } from './state'

/* Concept-map steps (Architecture §4.3): extract → validate + store → layout → align markers. */

interface CourseGraph {
  concepts: CourseConcept[]
  edges: CourseEdge[]
}

/**
 * The course's concepts and edges. `exceptLecture` leaves out that lecture's own edges: a re-run
 * recomputes them, so the old ones must not count towards the DAG check.
 */
async function loadCourseGraph(
  db: DbLike,
  courseId: string,
  exceptLecture?: string,
): Promise<CourseGraph> {
  const [conceptRows, edges] = await Promise.all([
    db
      .select({ id: concepts.id, canonicalKey: concepts.canonicalKey, name: concepts.name })
      .from(concepts)
      .where(eq(concepts.courseId, courseId)),
    db
      .select({
        id: conceptEdges.id,
        fromId: conceptEdges.fromConceptId,
        toId: conceptEdges.toConceptId,
        relation: conceptEdges.relation,
      })
      .from(conceptEdges)
      .where(
        and(
          eq(conceptEdges.courseId, courseId),
          exceptLecture
            ? sql`${conceptEdges.lectureId} is distinct from ${exceptLecture}`
            : undefined,
        ),
      ),
  ])
  return { concepts: conceptRows, edges }
}

interface ExtractOutput {
  extraction: ExtractConceptsOutput
  model: string
}

type ExtractInput = Parameters<typeof extractConceptsTask.buildPrompt>[0]

/**
 * runTask(extractConceptsTask) over the whole transcript (F2.1) with the course's concepts for
 * dedupe (ADR-006) and a count scaled to the lecture length (F2.2). The course-wide DAG check is
 * added to the task's validation so the one repair call can fix a cycle too. The extraction is
 * kept in the step output (a few KB, no transcript text) until validateGraph stores it.
 */
export async function extractConceptsStep(db: DbLike, lectureId: string): Promise<ExtractOutput> {
  return runStep(db, lectureId, 'extractConcepts', async () => {
    const lecture = await loadLecture(db, lectureId)
    const segments = await loadSegments(db, lectureId)
    if (segments.length === 0) {
      throw new PipelineError('no_transcript', 'This lecture has no transcript yet.')
    }
    const course = await loadCourseGraph(db, lecture.courseId, lectureId)
    const task = {
      ...extractConceptsTask,
      validate: (out: ExtractConceptsOutput, input: ExtractInput) => [
        ...(extractConceptsTask.validate?.(out, input) ?? []),
        ...cycleErrors(planGraph(out, course.concepts), course.edges),
      ],
    }
    const { output, model } = await runTask(
      task,
      {
        lectureTitle: lecture.title,
        segments: segments.map(({ idx, text }) => ({ idx, text })),
        existingConcepts: course.concepts.map(({ canonicalKey, name }) => ({ canonicalKey, name })),
        targetCount: scaleForMinutes(lectureMinutes(lecture, segments)).nodes,
        chapterCount: lecture.hasTimestamps ? chapterCountRange(spokenMinutes(segments)) : null,
      },
      aiContext({ userId: lecture.ownerId, lectureId, intake: true, skipQuota: true, db }),
    )
    return { extraction: output, model }
  })
}

/**
 * Stores the plan in one transaction: new concepts (ON CONFLICT on the course's canonical key
 * reuses a concurrent insert), this lecture's occurrences (upserted, so a re-run adds rather than
 * replaces), this lecture's edges (recomputed) and its chapters (replaced).
 */
async function storeGraph(
  db: DbLike,
  lecture: PipelineLecture,
  plan: GraphPlan,
  chapters: ChapterRange[] | null,
): Promise<{ concepts: number; reused: number }> {
  return db.transaction(async (tx) => {
    const fresh = plan.concepts.filter((c) => c.existingId === null)
    const freshKeys = fresh.map((c) => c.concept.canonicalKey)
    if (fresh.length > 0) {
      await tx
        .insert(concepts)
        .values(
          fresh.map(({ concept: c }) => ({
            id: uuidv7(),
            courseId: lecture.courseId,
            name: c.name,
            canonicalKey: c.canonicalKey,
            summary: c.summary,
            keyPoints: c.keyPoints,
            firstLectureId: lecture.id,
          })),
        )
        .onConflictDoNothing()
    }
    const freshRows =
      fresh.length === 0
        ? []
        : await tx
            .select({ id: concepts.id, canonicalKey: concepts.canonicalKey })
            .from(concepts)
            .where(
              and(
                eq(concepts.courseId, lecture.courseId),
                inArray(concepts.canonicalKey, freshKeys),
              ),
            )
    const freshIds = new Map(freshRows.map((r) => [r.canonicalKey, r.id]))
    const idOf = new Map(
      plan.concepts.map((c) => [nodeId(c), c.existingId ?? freshIds.get(c.concept.canonicalKey)]),
    )
    const conceptId = (node: string): string => {
      const id = idOf.get(node) ?? node
      if (id.startsWith('new:')) throw new Error(`concept ${node} was not stored`)
      return id
    }

    if (plan.concepts.length > 0) {
      await tx
        .insert(conceptOccurrences)
        .values(
          plan.concepts.map((c) => ({
            conceptId: conceptId(nodeId(c)),
            lectureId: lecture.id,
            segmentIdxs: c.concept.segmentIdxs,
            salience: Math.min(1, Math.max(0, c.concept.salience)),
          })),
        )
        .onConflictDoUpdate({
          target: [conceptOccurrences.conceptId, conceptOccurrences.lectureId],
          set: { segmentIdxs: sql`excluded.segment_idxs`, salience: sql`excluded.salience` },
        })
    }
    await tx.delete(conceptEdges).where(eq(conceptEdges.lectureId, lecture.id))
    if (plan.edges.length > 0) {
      await tx
        .insert(conceptEdges)
        .values(
          plan.edges.map((e) => ({
            id: uuidv7(),
            courseId: lecture.courseId,
            fromConceptId: conceptId(e.from),
            toConceptId: conceptId(e.to),
            relation: e.relation,
            lectureId: lecture.id,
            segmentIdxs: e.segmentIdxs,
          })),
        )
        .onConflictDoNothing()
    }
    await tx
      .update(lectures)
      .set({
        chapters:
          chapters?.map(({ id, title, summary, startIdx, endIdx, concepts }) => ({
            id,
            title,
            summary,
            startIdx,
            endIdx,
            conceptIds: [...new Set(concepts.map(conceptId))],
          })) ?? null,
      })
      .where(eq(lectures.id, lecture.id))
    return { concepts: plan.concepts.length, reused: plan.concepts.length - fresh.length }
  })
}

/**
 * Citations exist, depends_on stays a DAG, dedupe by canonical key, chapters check out (F11.2);
 * then stores the graph.
 */
export async function validateGraphStep(
  db: DbLike,
  lectureId: string,
): Promise<{ concepts: number; reused: number; edges: number; chapters: number }> {
  return runStep(db, lectureId, 'validateGraph', async () => {
    const { extraction } = await stepOutput<ExtractOutput>(db, lectureId, 'extractConcepts')
    if (!extraction) {
      throw new PipelineError('invalid_graph', 'The concept extraction is missing. Please retry.')
    }
    const lecture = await loadLecture(db, lectureId)
    const segments = await loadSegments(db, lectureId)
    const course = await loadCourseGraph(db, lecture.courseId, lectureId)
    const plan = planGraph(extraction, course.concepts)
    const errors = graphErrors(plan, new Set(segments.map((s) => s.idx)), course.edges)
    if (errors.length > 0) {
      console.warn(JSON.stringify({ event: 'invalid_graph', lectureId, errors }))
      throw new PipelineError(
        'invalid_graph',
        'The concept map failed our consistency checks. Retrying usually fixes this.',
      )
    }
    const { chapters, errors: chapterErrors } = planChapters(
      extraction,
      plan,
      segments.map((s) => s.idx),
      spokenMinutes(segments),
      lecture.hasTimestamps,
    )
    if (chapterErrors.length > 0) {
      console.warn(JSON.stringify({ event: 'invalid_chapters', lectureId, errors: chapterErrors }))
    }
    const stored = await storeGraph(db, lecture, plan, chapters)
    return { ...stored, edges: plan.edges.length, chapters: chapters?.length ?? 0 }
  })
}

/** ELK once over the whole course; positions + layout_hash stored on the course. */
export async function layoutMapStep(db: DbLike, lectureId: string): Promise<{ nodes: number }> {
  return runStep(db, lectureId, 'layoutMap', async () => {
    const lecture = await loadLecture(db, lectureId)
    const graph = await loadCourseGraph(db, lecture.courseId)
    const nodes = graph.concepts.map((c) => ({ id: c.id }))
    const edges = graph.edges.map((e) => ({
      id: e.id,
      from: e.fromId,
      to: e.toId,
      relation: e.relation,
    }))
    const hash = layoutHash(nodes, edges)
    const [course] = await db
      .select({ layoutHash: courses.layoutHash })
      .from(courses)
      .where(eq(courses.id, lecture.courseId))
    // Same concepts and edges as the stored layout (e.g. a re-run that added nothing): keep it.
    if (course?.layoutHash === hash) return { nodes: nodes.length }
    const layout = await computeLayout(nodes, edges)
    await db
      .update(courses)
      .set({ layout, layoutHash: hash })
      .where(eq(courses.id, lecture.courseId))
    return { nodes: nodes.length }
  })
}

/** Re-links every live marker on the lecture (markers captured before processing finished). */
export async function alignMarkersStep(
  db: DbLike,
  lectureId: string,
): Promise<{ markers: number }> {
  return runStep(db, lectureId, 'alignMarkers', async () => {
    const lecture = await loadLecture(db, lectureId)
    // No timestamps → markers are disabled for this lecture (F1.7).
    if (!lecture.hasTimestamps) return { markers: 0 }
    const live = await db
      .select({ id: markers.id, kind: markers.kind, tMs: markers.tMs })
      .from(markers)
      .where(and(eq(markers.lectureId, lectureId), isNull(markers.deletedAt)))
    if (live.length > 0) {
      const ids = live.map((m) => m.id)
      await db.delete(markerConcepts).where(inArray(markerConcepts.markerId, ids))
      await alignOnWrite(db, lectureId, live)
    }
    return { markers: live.length }
  })
}
