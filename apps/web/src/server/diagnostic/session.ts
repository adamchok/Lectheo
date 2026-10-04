import type { ConfidenceLevel } from '@lectheo/contracts'
import { DiagnosticSessionResponse } from '@lectheo/contracts'
import { and, diagnosticResponses, eq } from '@lectheo/db'
import type { z } from 'zod'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { invalidState } from '../errors'
import {
  isFollowUpAt,
  loadItem,
  loadItems,
  loadOwnedSession,
  loadResponses,
  mcqOf,
  positionOf,
} from './shared'

/** GET /diagnostic/{sid}: resume state. Never includes options. */
export async function getSession(
  actor: Actor,
  sid: string,
  db: DbLike = appDb(),
): Promise<z.input<typeof DiagnosticSessionResponse>> {
  const session = await loadOwnedSession(db, actor, sid)
  const [byId, responses] = await Promise.all([
    loadItems(db, session.plannedItemIds),
    loadResponses(db, session.id),
  ])
  const responseOf = new Map(responses.map((r) => [r.itemId, r]))
  return {
    sessionId: session.id,
    status: session.status,
    items: session.plannedItemIds.map((id, position) => {
      const item = byId.get(id)
      if (!item) throw new Error(`diagnostic item ${id} missing`)
      const response = responseOf.get(id)
      const answered = response?.optionId != null
      return {
        id,
        stem: mcqOf(item).stem,
        position,
        isFollowUp: response?.isFollowUp ?? isFollowUpAt(session, position),
        ...(response ? { confidence: response.confidence } : {}),
        answered,
        ...(answered && response.correct !== null ? { correct: response.correct } : {}),
      }
    }),
  }
}

/**
 * POST /diagnostic/{sid}/items/{itemId}/confidence (F3.3): records the rating once and is the
 * only endpoint that reveals options. Same level again → same options; another level → 409.
 */
export async function recordConfidence(
  actor: Actor,
  sid: string,
  itemId: string,
  level: ConfidenceLevel,
  db: DbLike = appDb(),
): Promise<{ options: { id: string; text: string }[] }> {
  const session = await loadOwnedSession(db, actor, sid)
  const position = positionOf(session, itemId)
  const item = await loadItem(db, itemId)

  await db
    .insert(diagnosticResponses)
    .values({
      sessionId: session.id,
      itemId,
      isFollowUp: isFollowUpAt(session, position),
      confidence: level,
    })
    .onConflictDoNothing()
  const [stored] = await db
    .select()
    .from(diagnosticResponses)
    .where(
      and(eq(diagnosticResponses.sessionId, session.id), eq(diagnosticResponses.itemId, itemId)),
    )
    .limit(1)
  if (!stored) throw new Error('diagnostic response missing after ON CONFLICT')
  if (stored.confidence !== level) {
    throw invalidState('Confidence was already recorded for this question.', {
      reason: 'confidence_locked',
    })
  }
  return { options: mcqOf(item).options }
}
