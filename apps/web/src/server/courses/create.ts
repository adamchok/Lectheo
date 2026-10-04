import type { CourseSummary } from '@lectheo/contracts'
import { and, count, courses, eq, ne } from '@lectheo/db'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, notFound } from '../errors'
import { courseSummary } from './summary'

/** Sample accounts can create one personal course (API Spec §4). */
export const SAMPLE_PERSONAL_COURSE_LIMIT = 1

export interface CreateCourseInput {
  id: string
  title: string
}

/**
 * POST /courses. Safe retry: a replay with the same id returns the existing course (when the
 * actor owns it; any other existing id is a 404, no existence leak).
 */
export async function createCourse(
  actor: Actor,
  input: CreateCourseInput,
  db: DbLike = appDb(),
): Promise<CourseSummary> {
  const [existing] = await db
    .select({ ownerId: courses.ownerId, kind: courses.kind })
    .from(courses)
    .where(eq(courses.id, input.id))
    .limit(1)
  if (existing) return replay(actor, input.id, existing, db)

  if (actor.isSample) await assertSampleCanCreate(actor, input.id, db)

  const inserted = await db
    .insert(courses)
    .values({ id: input.id, ownerId: actor.userId, kind: 'personal', title: input.title })
    .onConflictDoNothing({ target: courses.id })
    .returning({ id: courses.id })
  if (inserted.length === 0) {
    // Lost a race with a concurrent request carrying the same id.
    const [row] = await db
      .select({ ownerId: courses.ownerId, kind: courses.kind })
      .from(courses)
      .where(eq(courses.id, input.id))
      .limit(1)
    if (!row) throw notFound()
    return replay(actor, input.id, row, db)
  }
  return courseSummary(db, actor.userId, input.id)
}

function replay(
  actor: Actor,
  id: string,
  row: { ownerId: string | null; kind: string },
  db: DbLike,
): Promise<CourseSummary> {
  if (row.kind !== 'personal' || row.ownerId !== actor.userId) throw notFound()
  return courseSummary(db, actor.userId, id)
}

async function assertSampleCanCreate(actor: Actor, id: string, db: DbLike): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(courses)
    .where(
      and(eq(courses.ownerId, actor.userId), eq(courses.kind, 'personal'), ne(courses.id, id)),
    )
  if ((row?.n ?? 0) >= SAMPLE_PERSONAL_COURSE_LIMIT) {
    throw new ApiError(
      'sample_account_restricted',
      'Sample accounts can create one course. Sign in with Google to add more.',
      { limit: SAMPLE_PERSONAL_COURSE_LIMIT },
    )
  }
}
