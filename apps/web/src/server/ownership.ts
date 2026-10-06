import { and, courses, eq, lectures, or } from '@lectheo/db'
import { z } from 'zod'
import type { Actor } from './auth'
import { appDb, type DbLike } from './db'
import { notFound } from './errors'

/*
 * Authorization rule (Architecture §9.1, API Spec §1):
 * - read:  the actor owns it OR it is library content and the actor is a sample or owner account
 *          (Google accounts start fresh and never see the library, F0.7);
 * - write: the actor owns it (library content is writable by no one at runtime).
 * Anything else, including other users' ids and malformed ids, is a 404 (no existence leak).
 */

export type Course = typeof courses.$inferSelect
export type Lecture = typeof lectures.$inferSelect
export interface LectureWithCourse {
  lecture: Lecture
  course: Course
}

const isUuid = (id: string): boolean => z.uuid().safeParse(id).success

/** The CS50 library belongs to the sample experience (F0.7): sample and owner accounts only. */
export const canReadLibrary = (actor: Actor): boolean => actor.kind !== 'google'

/** SQL condition on `courses` for the read rule. Every read path uses this, never its own. */
export const readableCourse = (actor: Actor) =>
  canReadLibrary(actor)
    ? or(eq(courses.ownerId, actor.userId), eq(courses.kind, 'library'))
    : eq(courses.ownerId, actor.userId)
const writable = (actor: Actor) =>
  and(eq(courses.ownerId, actor.userId), eq(courses.kind, 'personal'))

async function loadCourse(db: DbLike, id: string, access: ReturnType<typeof readableCourse>) {
  if (!isUuid(id)) throw notFound()
  const [row] = await db
    .select()
    .from(courses)
    .where(and(eq(courses.id, id), access))
    .limit(1)
  if (!row) throw notFound()
  return row
}

async function loadLecture(
  db: DbLike,
  id: string,
  access: ReturnType<typeof readableCourse>,
): Promise<LectureWithCourse> {
  if (!isUuid(id)) throw notFound()
  const [row] = await db
    .select({ lecture: lectures, course: courses })
    .from(lectures)
    .innerJoin(courses, eq(courses.id, lectures.courseId))
    .where(and(eq(lectures.id, id), access))
    .limit(1)
  if (!row) throw notFound()
  return row
}

export const loadCourseForRead = (actor: Actor, id: string, db: DbLike = appDb()) =>
  loadCourse(db, id, readableCourse(actor))

export const loadCourseForWrite = (actor: Actor, id: string, db: DbLike = appDb()) =>
  loadCourse(db, id, writable(actor))

export const loadLectureForRead = (actor: Actor, id: string, db: DbLike = appDb()) =>
  loadLecture(db, id, readableCourse(actor))

export const loadLectureForWrite = (actor: Actor, id: string, db: DbLike = appDb()) =>
  loadLecture(db, id, writable(actor))
