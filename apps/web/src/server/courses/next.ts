import type { ActivityType, NextStepResponse } from '@lectheo/contracts'
import {
  and,
  asc,
  conceptEdges,
  conceptOccurrences,
  concepts,
  desc,
  eq,
  isNull,
  lectures,
  markerConcepts,
  markers,
  sql,
} from '@lectheo/db'
import {
  type ConceptDetail,
  type ConceptSignal,
  type EvidenceMarker,
  type LectureRef,
  type MasteryAttempt,
  type NextStepInput,
  briefReadMinutes,
  dashboardNextStep,
  nextActivityType,
  prerequisitesOfRed,
  rankConcepts,
} from '@lectheo/domain'
import { pickUnseenItem } from '../activities/items'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { FEATURES } from '../features'
import { loadAttemptsByConcept, masteryFromAttempts } from '../mastery'
import { type Course, loadCourseForRead } from '../ownership'

/*
 * GET /courses/{id}/next (Architecture §6.3, F0.4, F0.9–F0.12). This file only gathers data; the
 * order, evidence, estimate and payoff rules live in domain/recommender.ts.
 * 2–3 queries when a lecture step wins, otherwise 6 in 4 round trips plus one bank check per
 * shown concept.
 */

/*
 * Raw SQL below is fully qualified ("lectures"."id"): Drizzle renders columns unqualified in
 * single-table selects, which would bind them to the subquery's own table.
 */

/** Lectures with this user's watch/diagnostic flags, in course order. */
const loadLectureFlags = (db: DbLike, courseId: string, userId: string) =>
  db
    .select({
      id: lectures.id,
      title: lectures.title,
      seq: lectures.seq,
      source: lectures.source,
      status: lectures.status,
      durationMs: lectures.durationMs,
      media: lectures.media,
      hasMarkers: sql<boolean>`exists (select 1 from markers m
        where m.lecture_id = "lectures"."id" and m.user_id = ${userId} and m.deleted_at is null)`,
      hasSession: sql<boolean>`exists (select 1 from diagnostic_sessions s
        where s.lecture_id = "lectures"."id" and s.user_id = ${userId})`,
      hasCompletedSession: sql<boolean>`exists (select 1 from diagnostic_sessions s
        where s.lecture_id = "lectures"."id" and s.user_id = ${userId}
        and s.status = 'completed')`,
    })
    .from(lectures)
    .where(eq(lectures.courseId, courseId))
    .orderBy(asc(lectures.seq), asc(lectures.createdAt))

type LectureFlags = Awaited<ReturnType<typeof loadLectureFlags>>[number]

/** "Lecture 5" for library lectures (F0.4 copy), the user's own title otherwise. */
const lectureTitle = (l: Pick<LectureFlags, 'source' | 'seq' | 'title'>): string =>
  l.source === 'library' ? `Lecture ${l.seq}` : l.title

/**
 * What the student will actually watch: library lectures play only the media window
 * (`startMs..endMs`, e.g. 45 min of a 2 h video); otherwise the whole recording.
 */
export function watchMs(l: Pick<LectureFlags, 'durationMs' | 'media'>): number | null {
  const start = l.media?.startMs
  const end = l.media?.endMs
  if (typeof start === 'number' && typeof end === 'number' && end > start) return end - start
  return l.durationMs
}

const lectureRef = (l: LectureFlags): LectureRef => ({
  lectureId: l.id,
  title: lectureTitle(l),
  durationMs: watchMs(l),
})

/**
 * Processing: in the pipeline (processing, or map_ready while questions are written).
 * Unwatched: a ready library lecture with no markers and no diagnostic session.
 * Pending diagnostic: a ready lecture with no completed session that the user watched (has
 * markers) or brought themselves (personal lectures have no watch step to detect).
 */
function lectureSteps(rows: LectureFlags[]) {
  const ready = rows.filter((l) => l.status === 'ready')
  return {
    processing: rows
      .filter((l) => l.status === 'processing' || l.status === 'map_ready')
      .map(lectureRef),
    failed: rows.filter((l) => l.status === 'failed').map(lectureRef),
    unfinished: rows
      .filter((l) => l.status === 'draft' || l.status === 'uploading')
      .map(lectureRef),
    unwatched: ready
      .filter((l) => l.source === 'library' && !l.hasMarkers && !l.hasSession)
      .map(lectureRef),
    pending: ready
      .filter((l) => !l.hasCompletedSession && (l.hasMarkers || l.source !== 'library'))
      .map(lectureRef),
  }
}

/** The Study brief's reading time for the lecture the card suggests (F9.7). One query. */
async function withReadMinutes(db: DbLike, lecture: LectureRef): Promise<LectureRef> {
  const rows = await db
    .select({ name: concepts.name, summary: concepts.summary, keyPoints: concepts.keyPoints })
    .from(conceptOccurrences)
    .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
    .where(eq(conceptOccurrences.lectureId, lecture.lectureId))
  return { ...lecture, readMinutes: briefReadMinutes(rows) }
}

/** "Add Lecture N" in the student's own course; the library isn't theirs to extend. */
const nextLectureSeq = (course: Course, rows: LectureFlags[]): number | null =>
  course.kind === 'personal' ? Math.max(0, ...rows.map((l) => l.seq ?? 0)) + 1 : null

/** This user's live marks in the course (or one lecture), newest first, with their concept. */
const loadMarks = (db: DbLike, courseId: string, userId: string, lectureId?: string) =>
  db
    .select({
      conceptId: markerConcepts.conceptId,
      kind: markers.kind,
      lectureId: markers.lectureId,
      tMs: markers.tMs,
      title: lectures.title,
      seq: lectures.seq,
      source: lectures.source,
    })
    .from(markers)
    .innerJoin(lectures, eq(lectures.id, markers.lectureId))
    .leftJoin(markerConcepts, eq(markerConcepts.markerId, markers.id))
    .where(
      and(
        eq(lectures.courseId, courseId),
        eq(markers.userId, userId),
        isNull(markers.deletedAt),
        lectureId ? eq(markers.lectureId, lectureId) : undefined,
      ),
    )
    .orderBy(desc(markers.createdAt), desc(markers.id))

type MarkRow = Awaited<ReturnType<typeof loadMarks>>[number]

const toEvidenceMarker = (m: MarkRow): EvidenceMarker => ({
  kind: m.kind,
  lectureId: m.lectureId,
  lectureTitle: lectureTitle(m),
  tMs: m.tMs,
})

/** Concepts in map order with the latest practice time (epoch ms) for the user. */
const loadConceptRows = (db: DbLike, courseId: string, userId: string) =>
  db
    .select({
      id: concepts.id,
      name: concepts.name,
      lastPracticedMs: sql<string | null>`extract(epoch from greatest(
        (select max(ac.created_at) from activities ac
          where ac.concept_id = "concepts"."id" and ac.user_id = ${userId}),
        (select max(at.created_at) from attempts at
          where at.concept_id = "concepts"."id" and at.user_id = ${userId}
          and at.activity_type <> 'diagnostic')
      )) * 1000`,
    })
    .from(concepts)
    .leftJoin(lectures, eq(lectures.id, concepts.firstLectureId))
    .where(eq(concepts.courseId, courseId))
    .orderBy(asc(lectures.seq), asc(concepts.name), asc(concepts.id))

const loadDependsOn = (db: DbLike, courseId: string) =>
  db
    .select({
      from: conceptEdges.fromConceptId,
      to: conceptEdges.toConceptId,
      relation: conceptEdges.relation,
    })
    .from(conceptEdges)
    .where(and(eq(conceptEdges.courseId, courseId), eq(conceptEdges.relation, 'depends_on')))

/** The card shows the top concept plus two "Also worth doing" rows (F0.11). */
const CARD_CONCEPTS = 3

/** Next activity per concept; transfer only when the bank still has an item for this user (F4b). */
async function activityTypesFor(
  db: DbLike,
  userId: string,
  conceptIds: readonly string[],
  attempts: ReadonlyMap<string, readonly MasteryAttempt[]>,
): Promise<Map<string, ActivityType>> {
  const entries = await Promise.all(
    conceptIds.map(async (id): Promise<[string, ActivityType]> => {
      const transfer =
        FEATURES.transfer && (await pickUnseenItem(db, userId, id, 'transfer')) !== null
      return [id, nextActivityType(attempts.get(id) ?? [], { ...FEATURES, transfer })]
    }),
  )
  return new Map(entries)
}

export async function getNextStep(
  actor: Actor,
  courseId: string,
  db: DbLike = appDb(),
  now: Date = new Date(),
): Promise<NextStepResponse> {
  const course = await loadCourseForRead(actor, courseId, db)
  const rows = await loadLectureFlags(db, course.id, actor.userId)
  const steps = lectureSteps(rows)
  const base: NextStepInput = {
    processingLectures: steps.processing,
    unwatchedLibraryLectures: steps.unwatched,
    pendingDiagnostics: steps.pending,
    failedLectures: steps.failed,
    unfinishedLectures: steps.unfinished,
    nextLectureSeq: nextLectureSeq(course, rows),
    stumpEnabled: FEATURES.stump,
    rankedConcepts: [],
    masteredConcepts: [],
    concepts: new Map(),
    activityTypes: new Map(),
  }
  if (steps.processing.length > 0) return dashboardNextStep(base)
  const [unwatched, ...laterUnwatched] = steps.unwatched
  if (unwatched) {
    const study = await withReadMinutes(db, unwatched)
    return dashboardNextStep({ ...base, unwatchedLibraryLectures: [study, ...laterUnwatched] })
  }
  const pending = steps.pending[0]
  if (pending) {
    const marks = await loadMarks(db, course.id, actor.userId, pending.lectureId)
    return dashboardNextStep({ ...base, pendingDiagnosticMarkers: marks.map(toEvidenceMarker) })
  }

  const [conceptRows, edges, marks] = await Promise.all([
    loadConceptRows(db, course.id, actor.userId),
    loadDependsOn(db, course.id),
    loadMarks(db, course.id, actor.userId),
  ])
  const conceptIds = conceptRows.map((c) => c.id)
  const byConcept = await loadAttemptsByConcept(actor.userId, conceptIds, db)
  const mastery = masteryFromAttempts(conceptIds, byConcept)
  const red = new Set([...mastery].filter(([, m]) => m.state === 'red').map(([id]) => id))
  const prereqs = prerequisitesOfRed(edges, red)
  const marksOf = (id: string) => marks.filter((m) => m.conceptId === id)
  const signals: ConceptSignal[] = conceptRows.map((c) => {
    const m = mastery.get(c.id)
    return {
      conceptId: c.id,
      conceptName: c.name,
      state: m?.state ?? 'gray',
      confidentMistake: m?.confidentMistake ?? false,
      markedLost: marksOf(c.id).some((mark) => mark.kind === 'lost'),
      prerequisiteOfRed: prereqs.has(c.id),
      lastPracticedAt: c.lastPracticedMs === null ? null : Number(c.lastPracticedMs),
    }
  })
  const ranked = rankConcepts(signals, now)
  const shownIds = ranked.slice(0, CARD_CONCEPTS).map((c) => c.conceptId)
  return dashboardNextStep({
    ...base,
    rankedConcepts: ranked,
    masteredConcepts: signals
      .filter((s) => s.state === 'green')
      .map((s) => ({ conceptId: s.conceptId, conceptName: s.conceptName })),
    concepts: new Map(
      conceptIds.map((id): [string, ConceptDetail] => [
        id,
        { attempts: byConcept.get(id) ?? [], markers: marksOf(id).map(toEvidenceMarker) },
      ]),
    ),
    activityTypes: await activityTypesFor(db, actor.userId, shownIds, byConcept),
  })
}
