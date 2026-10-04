import type { ItemKind } from '@lectheo/contracts'
import {
  activities,
  and,
  asc,
  diagnosticResponses,
  diagnosticSessions,
  eq,
  items,
  sql,
} from '@lectheo/db'
import type { DbLike } from '../db'
import { invalidState } from '../errors'
import type { ItemRow } from './types'

/**
 * A verified item of `kind` for the concept that this user has never seen: not used by any of
 * their activities nor answered in any of their diagnostics (F4c.9 "never the same scenario
 * twice", ADR-010). Lowest variant first. null when the bank is exhausted.
 */
export async function pickUnseenItem(
  db: DbLike,
  userId: string,
  conceptId: string,
  kind: ItemKind,
): Promise<ItemRow | null> {
  const [row] = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.conceptId, conceptId),
        eq(items.kind, kind),
        eq(items.status, 'verified'),
        sql`not exists (select 1 from ${activities} where ${activities.userId} = ${userId}
              and ${activities.itemId} = ${items.id})`,
        sql`not exists (select 1 from ${diagnosticResponses}
              join ${diagnosticSessions}
                on ${diagnosticSessions.id} = ${diagnosticResponses.sessionId}
              where ${diagnosticSessions.userId} = ${userId}
              and ${diagnosticResponses.itemId} = ${items.id})`,
      ),
    )
    .orderBy(asc(items.variant), asc(items.createdAt))
    .limit(1)
  return row ?? null
}

/** pickUnseenItem or 409 when the bank has nothing new for this user. */
export async function requireUnseenItem(
  db: DbLike,
  userId: string,
  conceptId: string,
  kind: ItemKind,
): Promise<ItemRow> {
  const item = await pickUnseenItem(db, userId, conceptId, kind)
  // TODO(feature-on-demand-items): generate + verify one inside the request (≤ 25 s, API §7)
  // instead of failing; the POST route already has maxDuration = 60.
  if (!item) throw invalidState('No new practice item available yet', { reason: 'bank_empty' })
  return item
}
