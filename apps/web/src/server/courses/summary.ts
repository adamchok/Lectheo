import type { Attribution, CourseSummary } from '@lectheo/contracts'
import { asc, concepts, courses, desc, eq, inArray, sql } from '@lectheo/db'
import { summarizeMastery } from '@lectheo/domain'
import type { Actor } from '../auth'
import type { DbLike } from '../db'
import { loadMasteryForUser } from '../mastery'
import { canReadLibrary, type Course, readableCourse } from '../ownership'

/** courses.attribution (jsonb) → the API's `{ text, url }` line (CC BY-NC-SA credit). */
export function toAttribution(json: Course['attribution']): Attribution | null {
  if (!json) return null
  return { text: `${json.source}, ${json.license}. Adapted by ${json.adaptedBy}.`, url: json.url }
}

/*
 * Raw SQL is fully qualified ("courses"."id"): Drizzle renders columns unqualified in
 * single-table selects.
 */

/**
 * The user's latest work in the course, epoch ms: their own course and lectures (created,
 * processed), marks, diagnostic sessions, activities and attempts. A lecture of theirs that just
 * became ready bumps `updated_at`, so its course wins (F0.4). Null when they haven't started.
 */
const lastActiveMs = (userId: string) => sql<string | null>`extract(epoch from greatest(
  case when "courses"."owner_id" = ${userId} then "courses"."created_at" end,
  (select max(l.updated_at) from lectures l
    where l.course_id = "courses"."id" and "courses"."owner_id" = ${userId}),
  (select max(m.created_at) from markers m join lectures l on l.id = m.lecture_id
    where l.course_id = "courses"."id" and m.user_id = ${userId}),
  (select max(s.created_at) from diagnostic_sessions s join lectures l on l.id = s.lecture_id
    where l.course_id = "courses"."id" and s.user_id = ${userId}),
  (select max(ac.created_at) from activities ac join concepts k on k.id = ac.concept_id
    where k.course_id = "courses"."id" and ac.user_id = ${userId}),
  (select max(at.created_at) from attempts at join concepts k on k.id = at.concept_id
    where k.course_id = "courses"."id" and at.user_id = ${userId})
)) * 1000`

const courseColumns = (userId: string) => ({
  id: courses.id,
  title: courses.title,
  kind: courses.kind,
  attribution: courses.attribution,
  lectureCount: sql<number>`(select count(*) from lectures l
    where l.course_id = "courses"."id")`.mapWith(Number),
  lastActiveMs: lastActiveMs(userId),
})

type CourseRow = Pick<Course, 'id' | 'title' | 'kind' | 'attribution'> & {
  lectureCount: number
  lastActiveMs: string | null
}

/**
 * CourseSummary for each row: 2 queries (course concepts, then attempts) regardless of the
 * number of courses.
 */
async function summarize(db: DbLike, userId: string, rows: CourseRow[]): Promise<CourseSummary[]> {
  if (rows.length === 0) return []
  const conceptRows = await db
    .select({ id: concepts.id, courseId: concepts.courseId })
    .from(concepts)
    .where(
      inArray(
        concepts.courseId,
        rows.map((r) => r.id),
      ),
    )
  const mastery = await loadMasteryForUser(
    db,
    userId,
    conceptRows.map((c) => c.id),
  )
  return rows.map((row) => {
    const states = conceptRows
      .filter((c) => c.courseId === row.id)
      .map((c) => mastery.get(c.id)?.state ?? 'gray')
    return {
      id: row.id,
      title: row.title,
      kind: row.kind,
      attribution: toAttribution(row.attribution),
      lectureCount: row.lectureCount,
      mastery: summarizeMastery(states),
      lastActiveAt:
        row.lastActiveMs === null ? null : new Date(Number(row.lastActiveMs)).toISOString(),
    }
  })
}

/**
 * GET /courses, 3 queries total. Google accounts: their own courses, most recently active first
 * (F0.8: an empty list is the first run). Sample and owner accounts: the library first, then
 * their own, each in creation order.
 */
export async function listCourseSummaries(db: DbLike, actor: Actor): Promise<CourseSummary[]> {
  const order = canReadLibrary(actor)
    ? [asc(courses.kind), asc(courses.createdAt), asc(courses.id)]
    : [sql`${lastActiveMs(actor.userId)} desc nulls last`, desc(courses.createdAt), asc(courses.id)]
  const rows = await db
    .select(courseColumns(actor.userId))
    .from(courses)
    .where(readableCourse(actor))
    .orderBy(...order)
  return summarize(db, actor.userId, rows)
}

/** One course's summary (POST /courses response), caller has already checked access. */
export async function courseSummary(
  db: DbLike,
  userId: string,
  courseId: string,
): Promise<CourseSummary> {
  const rows = await db.select(courseColumns(userId)).from(courses).where(eq(courses.id, courseId))
  const [summary] = await summarize(db, userId, rows)
  if (!summary) throw new Error(`Course ${courseId} vanished`)
  return summary
}
