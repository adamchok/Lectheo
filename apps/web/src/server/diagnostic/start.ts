import type { StartDiagnosticResponse } from '@lectheo/contracts'
import { and, asc, concepts, conceptOccurrences, diagnosticSessions, eq, sql } from '@lectheo/db'
import {
  diagnosticItemCount,
  MAX_FOLLOW_UPS,
  planDiagnostic,
  shortenedRunNote,
} from '@lectheo/domain'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { invalidState } from '../errors'
import { loadLectureForRead } from '../ownership'
import {
  coreCount,
  loadItems,
  markerCountsByConcept,
  mcqOf,
  sessionNote,
  unseenMcqs,
  type SessionRow,
} from './shared'

/** The lecture's concepts in lecture order (first occurrence segment). */
async function lectureConcepts(db: DbLike, lectureId: string) {
  return db
    .select({ id: concepts.id, firstLectureId: concepts.firstLectureId })
    .from(conceptOccurrences)
    .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
    .where(eq(conceptOccurrences.lectureId, lectureId))
    .orderBy(sql`"concept_occurrences"."segment_idxs"[1]`, asc(concepts.name))
}

async function activeSession(
  db: DbLike,
  userId: string,
  lectureId: string,
): Promise<SessionRow | undefined> {
  const [row] = await db
    .select()
    .from(diagnosticSessions)
    .where(
      and(
        eq(diagnosticSessions.userId, userId),
        eq(diagnosticSessions.lectureId, lectureId),
        eq(diagnosticSessions.status, 'active'),
      ),
    )
    .limit(1)
  return row
}

async function describe(
  db: DbLike,
  session: SessionRow,
  hasMarkers: boolean,
): Promise<StartDiagnosticResponse> {
  const byId = await loadItems(db, session.plannedItemIds)
  const stubs = session.plannedItemIds.map((id, position) => {
    const item = byId.get(id)
    if (!item) throw new Error(`diagnostic item ${id} missing`)
    // Stems only: options are revealed by the confidence endpoint (F3.3).
    return { id, conceptId: item.conceptId, stem: mcqOf(item).stem, position }
  })
  const note = sessionNote(hasMarkers, coreCount(session))
  return {
    sessionId: session.id,
    items: stubs,
    maxFollowUps: MAX_FOLLOW_UPS,
    ...(note ? { note } : {}),
  }
}

/**
 * POST /lectures/{id}/diagnostic (F3.1, F3.7, Architecture §4.4): the active session for
 * (user, lecture) if one exists, else a new plan from unseen verified MCQs.
 */
export async function startDiagnostic(
  actor: Actor,
  lectureId: string,
  db: DbLike = appDb(),
): Promise<StartDiagnosticResponse> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  const counts = await markerCountsByConcept(db, actor.userId, lecture.id)
  const hasMarkers = [...counts.values()].some((c) => c.lostCount > 0 || c.importantCount > 0)

  const existing = await activeSession(db, actor.userId, lecture.id)
  if (existing) return describe(db, existing, hasMarkers)

  const lectureRows = await lectureConcepts(db, lecture.id)
  const planConcepts = lectureRows.map(({ id: conceptId }) => ({
    conceptId,
    lostCount: counts.get(conceptId)?.lostCount ?? 0,
    importantCount: counts.get(conceptId)?.importantCount ?? 0,
  }))
  const pool = await unseenMcqs(db, actor.userId, lecture.id)
  // Scaled to the concepts this lecture introduces; recurring ones from earlier lectures are
  // still eligible but don't grow the run (judge path: 4–5 questions for CS50 L5).
  const introduced = lectureRows.filter((c) => c.firstLectureId === lecture.id).length
  const target = diagnosticItemCount(introduced || lectureRows.length)
  const plan = planDiagnostic(planConcepts, pool, target)
  if (plan.itemIds.length === 0) {
    throw invalidState(shortenedRunNote(0), { reason: 'no_items' })
  }

  // The partial unique index allows one active session per (user, lecture); a racing start
  // loses the insert and returns the winner's session.
  const [row] = await db
    .insert(diagnosticSessions)
    .values({ userId: actor.userId, lectureId: lecture.id, plannedItemIds: [...plan.itemIds] })
    .onConflictDoNothing()
    .returning()
  const session = row ?? (await activeSession(db, actor.userId, lecture.id))
  if (!session) throw new Error('diagnostic session missing after ON CONFLICT')
  return describe(db, session, hasMarkers)
}
