import type { NextStepResponse } from '@lectheo/contracts'
import { and, asc, conceptEdges, concepts, eq, lectures, sql } from '@lectheo/db'
import {
  type ConceptSignal,
  type LectureRef,
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
import { loadCourseForRead } from '../ownership'

/*
 * GET /courses/{id}/next (Architecture §6.3, F0.4): unwatched library lecture → pending
 * diagnostic → top-ranked concept. 2 queries when a lecture step wins, otherwise 5 in 4 round
 * trips (concepts and edges in parallel, then attempts).
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
const lectureRef = (l: LectureFlags): LectureRef => ({
  lectureId: l.id,
  title: l.source === 'library' ? `Lecture ${l.seq}` : l.title,
})

/**
 * Unwatched: a ready library lecture where the user has no markers and no diagnostic session.
 * Pending diagnostic: a ready lecture with no completed session that the user watched (has
 * markers) or brought themselves (personal lectures have no watch step to detect).
 */
function lectureSteps(rows: LectureFlags[]): {
  unwatched: LectureRef[]
  pending: LectureRef[]
} {
  const ready = rows.filter((l) => l.status === 'ready')
  return {
    unwatched: ready
      .filter((l) => l.source === 'library' && !l.hasMarkers && !l.hasSession)
      .map(lectureRef),
    pending: ready
      .filter((l) => !l.hasCompletedSession && (l.hasMarkers || l.source !== 'library'))
      .map(lectureRef),
  }
}

/** Concepts in map order with markedLost and the latest practice time (epoch ms) for the user. */
const loadConceptSignals = (db: DbLike, courseId: string, userId: string) =>
  db
    .select({
      id: concepts.id,
      name: concepts.name,
      markedLost: sql<boolean>`exists (select 1 from marker_concepts mc
        join markers m on m.id = mc.marker_id
        where mc.concept_id = "concepts"."id" and m.user_id = ${userId}
        and m.kind = 'lost' and m.deleted_at is null)`,
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

export async function getNextStep(
  actor: Actor,
  courseId: string,
  db: DbLike = appDb(),
  now: Date = new Date(),
): Promise<NextStepResponse> {
  const course = await loadCourseForRead(actor, courseId, db)
  const { unwatched, pending } = lectureSteps(await loadLectureFlags(db, course.id, actor.userId))
  if (unwatched.length > 0 || pending.length > 0) {
    return dashboardNextStep({
      unwatchedLibraryLectures: unwatched,
      pendingDiagnostics: pending,
      rankedConcepts: [],
    })
  }

  const [conceptRows, edges] = await Promise.all([
    loadConceptSignals(db, course.id, actor.userId),
    loadDependsOn(db, course.id),
  ])
  const conceptIds = conceptRows.map((c) => c.id)
  const byConcept = await loadAttemptsByConcept(actor.userId, conceptIds, db)
  const mastery = masteryFromAttempts(conceptIds, byConcept)
  const red = new Set([...mastery].filter(([, m]) => m.state === 'red').map(([id]) => id))
  const prereqs = prerequisitesOfRed(edges, red)
  const signals: ConceptSignal[] = conceptRows.map((c) => {
    const m = mastery.get(c.id)
    return {
      conceptId: c.id,
      conceptName: c.name,
      state: m?.state ?? 'gray',
      confidentMistake: m?.confidentMistake ?? false,
      markedLost: c.markedLost,
      prerequisiteOfRed: prereqs.has(c.id),
      lastPracticedAt: c.lastPracticedMs === null ? null : Number(c.lastPracticedMs),
    }
  })
  const ranked = rankConcepts(signals, now)
  const top = ranked[0]
  return dashboardNextStep({
    unwatchedLibraryLectures: [],
    pendingDiagnostics: [],
    rankedConcepts: ranked,
    topConceptActivity: top
      ? nextActivityType(byConcept.get(top.conceptId) ?? [], {
          ...FEATURES,
          // Transfer only when the bank still has an item for this user (F4b).
          transfer:
            FEATURES.transfer &&
            (await pickUnseenItem(db, actor.userId, top.conceptId, 'transfer')) !== null,
        })
      : undefined,
  })
}
