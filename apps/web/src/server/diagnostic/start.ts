import type { DiagnosticRound, StartDiagnosticResponse } from '@lectheo/contracts'
import { and, diagnosticSessions, eq } from '@lectheo/db'
import {
  diagnosticItemCount,
  MAX_FOLLOW_UPS,
  planDiagnostic,
  planRestRound,
  shortenedRunNote,
} from '@lectheo/domain'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { invalidState } from '../errors'
import { loadLectureForRead } from '../ownership'
import { diagnosticConcepts, testedConceptIds } from './coverage'
import {
  coreCount,
  loadItems,
  markerCountsByConcept,
  type MarkerCounts,
  mcqOf,
  sessionNote,
  unseenMcqs,
  type SessionRow,
} from './shared'

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
  // A rest round is untargeted and short by design: neither note applies (F3.10).
  const note = session.round === 'rest' ? undefined : sessionNote(hasMarkers, coreCount(session))
  return {
    sessionId: session.id,
    items: stubs,
    maxFollowUps: MAX_FOLLOW_UPS,
    ...(note ? { note } : {}),
  }
}

/**
 * POST /lectures/{id}/diagnostic (F3.1, F3.7, F3.9–F3.10, Architecture §4.4): the active session
 * for (user, lecture) if one exists (whatever its round), else a new plan from unseen verified
 * MCQs. `core` targets marked concepts then spreads the baseline across chapters; `rest` asks
 * one question per concept still *Not tested*.
 */
export async function startDiagnostic(
  actor: Actor,
  lectureId: string,
  db: DbLike = appDb(),
  round: DiagnosticRound = 'core',
): Promise<StartDiagnosticResponse> {
  const { lecture } = await loadLectureForRead(actor, lectureId, db)
  const counts = await markerCountsByConcept(db, actor.userId, lecture.id)
  const hasMarkers = [...counts.values()].some((c) => c.lostCount > 0 || c.importantCount > 0)

  const existing = await activeSession(db, actor.userId, lecture.id)
  if (existing) return describe(db, existing, hasMarkers)

  const lectureRows = await diagnosticConcepts(db, lecture)
  const itemIds =
    round === 'rest'
      ? await planRest(db, actor.userId, lecture.id, lectureRows)
      : planCore(lecture.id, lectureRows, counts, await unseenMcqs(db, actor.userId, lecture.id))

  // The partial unique index allows one active session per (user, lecture); a racing start
  // loses the insert and returns the winner's session.
  const [row] = await db
    .insert(diagnosticSessions)
    .values({ userId: actor.userId, lectureId: lecture.id, plannedItemIds: itemIds, round })
    .onConflictDoNothing()
    .returning()
  const session = row ?? (await activeSession(db, actor.userId, lecture.id))
  if (!session) throw new Error('diagnostic session missing after ON CONFLICT')
  return describe(db, session, hasMarkers)
}

type ConceptRows = Awaited<ReturnType<typeof diagnosticConcepts>>
type Pool = Awaited<ReturnType<typeof unseenMcqs>>

function planCore(
  lectureId: string,
  lectureRows: ConceptRows,
  counts: ReadonlyMap<string, MarkerCounts>,
  pool: Pool,
): string[] {
  const planConcepts = lectureRows.map((c) => ({
    conceptId: c.conceptId,
    chapterIndex: c.chapterIndex,
    lostCount: counts.get(c.conceptId)?.lostCount ?? 0,
    importantCount: counts.get(c.conceptId)?.importantCount ?? 0,
  }))
  // Scaled to the concepts this lecture introduces; recurring ones from earlier lectures are
  // still eligible but don't grow the run (judge path: 4–5 questions for CS50 L5).
  const introduced = lectureRows.filter((c) => c.firstLectureId === lectureId).length
  const target = diagnosticItemCount(introduced || lectureRows.length)
  const plan = planDiagnostic(planConcepts, pool, target)
  if (plan.itemIds.length === 0) {
    throw invalidState(shortenedRunNote(0), { reason: 'no_items' })
  }
  return [...plan.itemIds]
}

async function planRest(
  db: DbLike,
  userId: string,
  lectureId: string,
  lectureRows: ConceptRows,
): Promise<string[]> {
  const conceptIds = lectureRows.map((c) => c.conceptId)
  const [tested, pool] = await Promise.all([
    testedConceptIds(db, userId, conceptIds),
    unseenMcqs(db, userId, lectureId, { conceptIds }),
  ])
  const itemIds = planRestRound(
    lectureRows.map((c) => ({ ...c, tested: tested.has(c.conceptId) })),
    pool,
  )
  if (itemIds.length === 0) {
    throw invalidState('Every concept with a checked question has been tested.', {
      reason: 'nothing_to_test',
    })
  }
  return itemIds
}
