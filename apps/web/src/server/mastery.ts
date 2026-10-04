import { and, asc, attempts, diagnosticResponses, eq, inArray, ne } from '@lectheo/db'
import { computeMastery, type MasteryAttempt, type MasteryResult } from '@lectheo/domain'
import { appDb, type DbLike } from './db'

/* Mastery is computed on read from `attempts` (ADR-008, Architecture §6.2). No cache. */

/** One query: the user's valid attempts for these concepts, grouped by concept (oldest first). */
export async function loadAttemptsByConcept(
  userId: string,
  conceptIds: readonly string[],
  db: DbLike = appDb(),
): Promise<Map<string, MasteryAttempt[]>> {
  const byConcept = new Map<string, MasteryAttempt[]>()
  if (conceptIds.length === 0) return byConcept
  const rows = await db
    .select({
      conceptId: attempts.conceptId,
      activityType: attempts.activityType,
      outcome: attempts.outcome,
      confidence: attempts.confidence,
      assisted: attempts.assisted,
      createdAt: attempts.createdAt,
      itemId: attempts.itemId,
      diagnosticSessionId: attempts.diagnosticSessionId,
      isFollowUp: diagnosticResponses.isFollowUp,
    })
    .from(attempts)
    .leftJoin(
      diagnosticResponses,
      and(
        eq(attempts.activityType, 'diagnostic'),
        eq(diagnosticResponses.sessionId, attempts.diagnosticSessionId),
        eq(diagnosticResponses.itemId, attempts.itemId),
      ),
    )
    .where(
      and(
        eq(attempts.userId, userId),
        inArray(attempts.conceptId, [...conceptIds]),
        ne(attempts.outcome, 'invalid'),
      ),
    )
    .orderBy(asc(attempts.createdAt))

  for (const { conceptId, isFollowUp, ...rest } of rows) {
    const attempt: MasteryAttempt = { ...rest, isFollowUp: isFollowUp ?? false }
    const list = byConcept.get(conceptId)
    if (list) list.push(attempt)
    else byConcept.set(conceptId, [attempt])
  }
  return byConcept
}

/** Mastery for every requested concept (gray when the user has no attempts on it). */
export function masteryFromAttempts(
  conceptIds: readonly string[],
  byConcept: ReadonlyMap<string, readonly MasteryAttempt[]>,
): Map<string, MasteryResult> {
  return new Map(conceptIds.map((id) => [id, computeMastery(byConcept.get(id) ?? [])]))
}

/** Map<conceptId, {state, confidentMistake, reasons}> for one user (one query). */
export async function loadMasteryForUser(
  db: DbLike,
  userId: string,
  conceptIds: readonly string[],
): Promise<Map<string, MasteryResult>> {
  return masteryFromAttempts(conceptIds, await loadAttemptsByConcept(userId, conceptIds, db))
}
