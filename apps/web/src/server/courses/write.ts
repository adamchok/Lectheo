import type { CourseSummary } from '@lectheo/contracts'
import { and, courses, eq, lectures } from '@lectheo/db'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError } from '../errors'
import { deleteLecture, MID_RUN_STATUSES, type RemoveObjects } from '../lectures/write'
import { loadCourseForWrite } from '../ownership'
import { courseSummary } from './summary'

/* PATCH / DELETE /courses/{id} (F0.7). Write ownership: library and other users' courses → 404. */

/** PATCH /courses/{id} `{ title }` → the updated CourseSummary. */
export async function renameCourse(
  actor: Actor,
  courseId: string,
  title: string,
  db: DbLike = appDb(),
): Promise<CourseSummary> {
  const course = await loadCourseForWrite(actor, courseId, db)
  await db.update(courses).set({ title }).where(eq(courses.id, course.id))
  return courseSummary(db, actor.userId, course.id)
}

/**
 * DELETE /courses/{id} (F8.2): each lecture goes through deleteLecture (cascades, orphaned
 * concepts, Storage), then the course row (its remaining concepts and edges cascade). Not one
 * transaction: a retry after a partial failure picks up the lectures that are left.
 * ponytail: a lecture added between the listing and the final delete cascades with the course
 * but keeps its Storage objects; DELETE /me sweeps the user's Storage prefix anyway.
 */
export async function deleteCourse(
  actor: Actor,
  courseId: string,
  db: DbLike = appDb(),
  removeObjects?: RemoveObjects,
): Promise<void> {
  const course = await loadCourseForWrite(actor, courseId, db)
  const rows = await db
    .select({ id: lectures.id, status: lectures.status })
    .from(lectures)
    .where(eq(lectures.courseId, course.id))
  if (rows.some((l) => MID_RUN_STATUSES.includes(l.status))) {
    throw new ApiError(
      'already_processing',
      'A lecture in this course is still processing. Delete the course once it finishes.',
    )
  }
  for (const lecture of rows) await deleteLecture(actor, lecture.id, db, removeObjects)
  await db.delete(courses).where(and(eq(courses.id, course.id), eq(courses.ownerId, actor.userId)))
}
