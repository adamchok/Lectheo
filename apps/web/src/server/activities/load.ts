import {
  activities,
  and,
  asc,
  conceptOccurrences,
  concepts,
  courses,
  desc,
  eq,
  items,
  itemSecrets,
  lectures,
  messages,
} from '@lectheo/db'
import type { CourseTitles } from '@lectheo/ai'
import { z } from 'zod'
import { aiContext } from '../ai-hooks'
import type { Actor } from '../auth'
import type { DbLike } from '../db'
import { notFound } from '../errors'
import { readableCourse } from '../ownership'
import type { ActivityContext, ActivityRow, ConceptRow, ItemRow, ItemSecretsRow } from './types'

/* Loading + ownership for the activities core. Every miss is a 404 (no existence leak). */

const isUuid = (id: string): boolean => z.uuid().safeParse(id).success

/** A concept the actor can read (ownership.ts read rule on its course). */
export async function loadConceptForRead(
  db: DbLike,
  actor: Actor,
  conceptId: string,
): Promise<ConceptRow> {
  if (!isUuid(conceptId)) throw notFound()
  const [row] = await db
    .select({ concept: concepts })
    .from(concepts)
    .innerJoin(courses, eq(courses.id, concepts.courseId))
    .where(and(eq(concepts.id, conceptId), readableCourse(actor)))
    .limit(1)
  if (!row) throw notFound()
  return row.concept
}

/** Any activity row by id (no ownership check — used for create replays). */
export async function findActivity(db: DbLike, id: string): Promise<ActivityRow | undefined> {
  const [row] = await db.select().from(activities).where(eq(activities.id, id)).limit(1)
  return row
}

/** The actor's own activity on a concept they can still read, else 404. */
export async function loadOwnedActivity(
  db: DbLike,
  actor: Actor,
  id: string,
): Promise<ActivityRow> {
  if (!isUuid(id)) throw notFound()
  const [row] = await db
    .select({ activity: activities })
    .from(activities)
    .innerJoin(concepts, eq(concepts.id, activities.conceptId))
    .innerJoin(courses, eq(courses.id, concepts.courseId))
    .where(and(eq(activities.id, id), eq(activities.userId, actor.userId), readableCourse(actor)))
    .limit(1)
  if (!row) throw notFound()
  return row.activity
}

async function loadItem(db: DbLike, itemId: string | null): Promise<ItemRow | null> {
  if (!itemId) return null
  const [row] = await db.select().from(items).where(eq(items.id, itemId)).limit(1)
  return row ?? null
}

async function loadSecrets(db: DbLike, item: ItemRow | null): Promise<ItemSecretsRow> {
  if (!item) throw new Error('This activity has no item, so it has no item secrets')
  const [row] = await db.select().from(itemSecrets).where(eq(itemSecrets.itemId, item.id)).limit(1)
  if (!row) throw new Error(`item_secrets missing for item ${item.id}`)
  return row
}

/** Prompt label when the course row is gone (FK makes this unreachable); never fail a judge on it. */
const FALLBACK_COURSE_TITLE = 'Untitled course'

/** The concept's lecture: its first lecture, else its most salient occurrence's (stump too). */
export const primaryLectureId = (
  concept: Pick<ConceptRow, 'firstLectureId'>,
  bySalience: readonly { lectureId: string }[],
): string | null => concept.firstLectureId ?? bySalience[0]?.lectureId ?? null

async function loadTitles(db: DbLike, concept: ConceptRow): Promise<CourseTitles> {
  const [[course], top] = await Promise.all([
    db.select({ title: courses.title }).from(courses).where(eq(courses.id, concept.courseId)),
    concept.firstLectureId
      ? []
      : db
          .select({ lectureId: conceptOccurrences.lectureId })
          .from(conceptOccurrences)
          .where(eq(conceptOccurrences.conceptId, concept.id))
          .orderBy(desc(conceptOccurrences.salience))
          .limit(1),
  ])
  const lectureId = primaryLectureId(concept, top)
  const [lecture] = lectureId
    ? await db.select({ title: lectures.title }).from(lectures).where(eq(lectures.id, lectureId))
    : []
  if (!course) {
    console.log(JSON.stringify({ event: 'titles_course_missing', conceptId: concept.id }))
  }
  return {
    courseTitle: course?.title ?? FALLBACK_COURSE_TITLE,
    lectureTitle: lecture?.title ?? null,
  }
}

export const visibleMessages = (db: DbLike, activityId: string) =>
  db
    .select()
    .from(messages)
    .where(and(eq(messages.activityId, activityId), eq(messages.visible, true)))
    .orderBy(asc(messages.createdAt), asc(messages.id))

/** Builds the handler context around a (fresh) activity row. */
export async function buildContext(
  db: DbLike,
  actor: Actor,
  activity: ActivityRow,
  concept?: ConceptRow,
): Promise<ActivityContext> {
  const [conceptRow, item] = await Promise.all([
    // Same read rule as a new activity: a leftover row on unreadable (library) content is a 404.
    concept ?? loadConceptForRead(db, actor, activity.conceptId),
    loadItem(db, activity.itemId),
  ])
  let secrets: Promise<ItemSecretsRow> | undefined
  let titles: Promise<CourseTitles> | undefined
  return {
    db,
    actor,
    concept: conceptRow,
    ai: aiContext({ actor, db }),
    activity,
    item,
    secrets: () => (secrets ??= loadSecrets(db, item)),
    titles: () => (titles ??= loadTitles(db, conceptRow)),
    visibleMessages: () => visibleMessages(db, activity.id),
  }
}
