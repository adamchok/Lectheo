import type { Attribution, CourseSummary } from '@lectheo/contracts'
import { asc, concepts, courses, eq, inArray, or, sql } from '@lectheo/db'
import { summarizeMastery } from '@lectheo/domain'
import type { Course } from '../ownership'
import type { DbLike } from '../db'
import { loadMasteryForUser } from '../mastery'

/** courses.attribution (jsonb) → the API's `{ text, url }` line (CC BY-NC-SA credit). */
export function toAttribution(json: Course['attribution']): Attribution | null {
  if (!json) return null
  return { text: `${json.source}, ${json.license}. Adapted by ${json.adaptedBy}.`, url: json.url }
}

type CourseRow = Pick<Course, 'id' | 'title' | 'kind' | 'attribution'> & { lectureCount: number }

const courseColumns = {
  id: courses.id,
  title: courses.title,
  kind: courses.kind,
  attribution: courses.attribution,
  // Raw SQL is fully qualified: Drizzle renders columns unqualified in single-table selects.
  lectureCount: sql<number>`(select count(*) from lectures l
    where l.course_id = "courses"."id")`.mapWith(Number),
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
    }
  })
}

/** GET /courses: library courses, then the user's personal courses. 3 queries total. */
export async function listCourseSummaries(db: DbLike, userId: string): Promise<CourseSummary[]> {
  const rows = await db
    .select(courseColumns)
    .from(courses)
    .where(or(eq(courses.kind, 'library'), eq(courses.ownerId, userId)))
    .orderBy(asc(courses.kind), asc(courses.createdAt), asc(courses.id))
  return summarize(db, userId, rows)
}

/** One course's summary (POST /courses response), caller has already checked access. */
export async function courseSummary(
  db: DbLike,
  userId: string,
  courseId: string,
): Promise<CourseSummary> {
  const rows = await db.select(courseColumns).from(courses).where(eq(courses.id, courseId))
  const [summary] = await summarize(db, userId, rows)
  if (!summary) throw new Error(`Course ${courseId} vanished`)
  return summary
}
