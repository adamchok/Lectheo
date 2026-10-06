import { McqPublicPayload, type SourceRef } from '@lectheo/contracts'
import {
  and,
  asc,
  count,
  courses,
  diagnosticResponses,
  diagnosticSessions,
  eq,
  inArray,
  isNull,
  items,
  lectures,
  markerConcepts,
  markers,
  not,
  sql,
} from '@lectheo/db'
import { NO_FLAGS_NOTE, shortenedRunNote, MIN_DIAGNOSTIC_ITEMS } from '@lectheo/domain'
import { z } from 'zod'
import { buildSources } from '../activities/sources'
import type { Actor } from '../auth'
import type { DbLike } from '../db'
import { notFound } from '../errors'
import { readableCourse } from '../ownership'

/* Shared loading for the diagnostic (F3, API Spec §6). Every miss is a 404 (no existence leak). */

export type SessionRow = typeof diagnosticSessions.$inferSelect
export type ResponseRow = typeof diagnosticResponses.$inferSelect
export type ItemRow = typeof items.$inferSelect

export const isUuid = (id: string): boolean => z.uuid().safeParse(id).success

/** The actor's own session on a lecture they can still read, else 404. */
export async function loadOwnedSession(db: DbLike, actor: Actor, sid: string): Promise<SessionRow> {
  if (!isUuid(sid)) throw notFound()
  const [row] = await db
    .select({ session: diagnosticSessions })
    .from(diagnosticSessions)
    .innerJoin(lectures, eq(lectures.id, diagnosticSessions.lectureId))
    .innerJoin(courses, eq(courses.id, lectures.courseId))
    .where(
      and(
        eq(diagnosticSessions.id, sid),
        eq(diagnosticSessions.userId, actor.userId),
        readableCourse(actor),
      ),
    )
    .limit(1)
  if (!row) throw notFound()
  return row.session
}

/**
 * Follow-ups are appended to `planned_item_ids` (and counted in `follow_ups_used`), so the
 * first `length - followUpsUsed` ids are the core questions.
 */
export const coreCount = (session: SessionRow): number =>
  session.plannedItemIds.length - session.followUpsUsed

export const isFollowUpAt = (session: SessionRow, position: number): boolean =>
  position >= coreCount(session)

/** Position of an item in the session (planned or issued follow-up), else 404. */
export function positionOf(session: SessionRow, itemId: string): number {
  const position = isUuid(itemId) ? session.plannedItemIds.indexOf(itemId) : -1
  if (position < 0) throw notFound()
  return position
}

export async function loadItems(db: DbLike, ids: readonly string[]): Promise<Map<string, ItemRow>> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .select()
    .from(items)
    .where(inArray(items.id, [...ids]))
  return new Map(rows.map((r) => [r.id, r]))
}

export async function loadItem(db: DbLike, id: string): Promise<ItemRow> {
  const item = (await loadItems(db, [id])).get(id)
  if (!item) throw notFound()
  return item
}

export const mcqOf = (item: ItemRow): McqPublicPayload => McqPublicPayload.parse(item.publicPayload)

export async function loadResponses(db: DbLike, sessionId: string): Promise<ResponseRow[]> {
  return db.select().from(diagnosticResponses).where(eq(diagnosticResponses.sessionId, sessionId))
}

/**
 * Verified diagnostic MCQs of this lecture the user has never seen: not used by any of their
 * activities, not planned in nor answered in any of their diagnostics, not in `excludeIds`.
 * Lowest variant first. Raw subqueries spell `"items"."id"` (Drizzle single-table gotcha).
 */
export async function unseenMcqs(
  db: DbLike,
  userId: string,
  lectureId: string,
  opts: { conceptId?: string; excludeIds?: readonly string[] } = {},
): Promise<{ itemId: string; conceptId: string }[]> {
  const exclude = opts.excludeIds ?? []
  return db
    .select({ itemId: items.id, conceptId: items.conceptId })
    .from(items)
    .where(
      and(
        eq(items.lectureId, lectureId),
        eq(items.kind, 'diagnostic_mcq'),
        eq(items.status, 'verified'),
        opts.conceptId ? eq(items.conceptId, opts.conceptId) : undefined,
        exclude.length > 0 ? not(inArray(items.id, [...exclude])) : undefined,
        sql`not exists (select 1 from activities a
              where a.user_id = ${userId} and a.item_id = "items"."id")`,
        sql`not exists (select 1 from diagnostic_sessions s
              where s.user_id = ${userId}
              and ("items"."id" = any(s.planned_item_ids)
                or exists (select 1 from diagnostic_responses r
                  where r.session_id = s.id and r.item_id = "items"."id")))`,
      ),
    )
    .orderBy(asc(items.variant), asc(items.createdAt), asc(items.id))
}

export interface MarkerCounts {
  readonly lostCount: number
  readonly importantCount: number
}

/** Per concept: this user's live markers in the lecture that are linked to it (F3.1). */
export async function markerCountsByConcept(
  db: DbLike,
  userId: string,
  lectureId: string,
): Promise<Map<string, MarkerCounts>> {
  const rows = await db
    .select({ conceptId: markerConcepts.conceptId, kind: markers.kind, n: count() })
    .from(markerConcepts)
    .innerJoin(markers, eq(markers.id, markerConcepts.markerId))
    .where(
      and(eq(markers.lectureId, lectureId), eq(markers.userId, userId), isNull(markers.deletedAt)),
    )
    .groupBy(markerConcepts.conceptId, markers.kind)
  const byConcept = new Map<string, MarkerCounts>()
  for (const { conceptId, kind, n } of rows) {
    const prev = byConcept.get(conceptId) ?? { lostCount: 0, importantCount: 0 }
    byConcept.set(
      conceptId,
      kind === 'lost' ? { ...prev, lostCount: n } : { ...prev, importantCount: n },
    )
  }
  return byConcept
}

/** Same notes as domain planDiagnostic, recomputed for a resumed session. */
export function sessionNote(hasMarkers: boolean, core: number): string | undefined {
  const notes = [
    hasMarkers ? null : NO_FLAGS_NOTE,
    core < MIN_DIAGNOSTIC_ITEMS ? shortenedRunNote(core) : null,
  ].filter((n): n is string => n !== null)
  return notes.length > 0 ? notes.join(' ') : undefined
}

/** The lecture moment an item is grounded in (first segment), or null. */
export async function itemSource(db: DbLike, item: ItemRow): Promise<SourceRef | null> {
  const [first] = await buildSources(db, item.lectureId, item.segmentIdxs, 1)
  return first ?? null
}
