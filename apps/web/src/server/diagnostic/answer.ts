import {
  AttemptGrading,
  DistractorMeta,
  McqAnswerKey,
  type AnswerResponse,
  type MasterySummary,
} from '@lectheo/contracts'
import {
  and,
  attempts,
  diagnosticResponses,
  diagnosticSessions,
  eq,
  isNull,
  itemSecrets,
  lt,
  sql,
} from '@lectheo/db'
import { classifyFinding, MAX_FOLLOW_UPS, shouldIssueFollowUp } from '@lectheo/domain'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, invalidState } from '../errors'
import { loadMasteryForUser } from '../mastery'
import {
  coreCount,
  itemSource,
  loadItem,
  loadItems,
  loadOwnedSession,
  loadResponses,
  mcqOf,
  positionOf,
  unseenMcqs,
  type ItemRow,
  type ResponseRow,
  type SessionRow,
} from './shared'

const isConfidentWrong = (r: ResponseRow): boolean => r.correct === false && r.confidence === 'sure'

async function loadSecrets(db: DbLike, itemId: string) {
  const [row] = await db.select().from(itemSecrets).where(eq(itemSecrets.itemId, itemId)).limit(1)
  if (!row) throw new Error(`item_secrets missing for item ${itemId}`)
  return row
}

async function loadResponse(db: DbLike, sessionId: string, itemId: string) {
  const [row] = await db
    .select()
    .from(diagnosticResponses)
    .where(
      and(eq(diagnosticResponses.sessionId, sessionId), eq(diagnosticResponses.itemId, itemId)),
    )
    .limit(1)
  return row
}

/**
 * Sure + wrong on a core question → append one unseen verified MCQ on the same concept
 * (F3.5). Guarded so the cap holds under concurrent answers.
 */
async function maybeIssueFollowUp(
  db: DbLike,
  session: SessionRow,
  item: ItemRow,
  response: ResponseRow,
): Promise<SessionRow> {
  const answer = {
    correct: response.correct === true,
    confidence: response.confidence,
    isFollowUp: response.isFollowUp,
  }
  if (!shouldIssueFollowUp(answer, session.followUpsUsed)) return session
  const [next] = await unseenMcqs(db, session.userId, session.lectureId, {
    conceptId: item.conceptId,
  })
  if (!next) return session
  const [updated] = await db
    .update(diagnosticSessions)
    .set({
      plannedItemIds: sql`array_append(${diagnosticSessions.plannedItemIds}, ${next.itemId}::uuid)`,
      followUpsUsed: sql`${diagnosticSessions.followUpsUsed} + 1`,
    })
    .where(
      and(
        eq(diagnosticSessions.id, session.id),
        eq(diagnosticSessions.status, 'active'),
        lt(diagnosticSessions.followUpsUsed, MAX_FOLLOW_UPS),
        sql`not (${next.itemId}::uuid = any(${diagnosticSessions.plannedItemIds}))`,
      ),
    )
    .returning()
  return updated ?? session
}

/**
 * The follow-up issued for a sure + wrong core answer: the first follow-up on the same concept.
 * ponytail: a concept planned twice with both sure + wrong would share one follow-up; the plan
 * only repeats a concept when the lecture has fewer concepts than questions.
 */
async function followUpFor(
  db: DbLike,
  session: SessionRow,
  item: ItemRow,
  response: ResponseRow,
): Promise<{ itemId: string; stem: string } | null> {
  if (response.isFollowUp || !isConfidentWrong(response)) return null
  const followUpIds = session.plannedItemIds.slice(coreCount(session))
  const byId = await loadItems(db, followUpIds)
  const match = followUpIds.map((id) => byId.get(id)).find((f) => f?.conceptId === item.conceptId)
  return match ? { itemId: match.id, stem: mcqOf(match).stem } : null
}

/** Marks the session completed once every planned item and issued follow-up is answered. */
async function completeIfDone(db: DbLike, session: SessionRow): Promise<void> {
  if (session.status !== 'active') return
  const answered = new Set(
    (await loadResponses(db, session.id)).filter((r) => r.optionId !== null).map((r) => r.itemId),
  )
  if (!session.plannedItemIds.every((id) => answered.has(id))) return
  await db
    .update(diagnosticSessions)
    .set({ status: 'completed', completedAt: new Date() })
    .where(and(eq(diagnosticSessions.id, session.id), eq(diagnosticSessions.status, 'active')))
}

async function masteryOf(db: DbLike, userId: string, conceptId: string): Promise<MasterySummary> {
  const result = (await loadMasteryForUser(db, userId, [conceptId])).get(conceptId)
  if (!result) throw new ApiError('internal_error')
  return {
    conceptId,
    state: result.state,
    confidentMistake: result.confidentMistake,
    reasons: [...result.reasons],
  }
}

/**
 * POST /diagnostic/{sid}/items/{itemId}/answer (F3.4, F3.5, Data Model invariant 3). Graded in
 * code against the answer key (no LLM). Guarded WHERE option_id IS NULL, so a retry (with any
 * option) returns the stored result instead of re-grading.
 */
export async function answerItem(
  actor: Actor,
  sid: string,
  itemId: string,
  optionId: string,
  db: DbLike = appDb(),
): Promise<AnswerResponse> {
  let session = await loadOwnedSession(db, actor, sid)
  positionOf(session, itemId)
  const item = await loadItem(db, itemId)
  const response = await loadResponse(db, session.id, itemId)
  if (!response) {
    throw invalidState('Rate your confidence first.', { reason: 'confidence_required' })
  }
  const secrets = await loadSecrets(db, itemId)
  const key = McqAnswerKey.parse(secrets.answerKey)
  const distractors = DistractorMeta.safeParse(secrets.distractorMeta).data ?? {}

  let stored = response
  if (response.optionId === null) {
    if (!mcqOf(item).options.some((o) => o.id === optionId)) {
      throw new ApiError('validation_failed', 'Pick one of the options.')
    }
    const correct = optionId === key.correctOptionId
    const [won] = await db
      .update(diagnosticResponses)
      .set({ optionId, correct, answeredAt: new Date() })
      .where(
        and(
          eq(diagnosticResponses.sessionId, session.id),
          eq(diagnosticResponses.itemId, itemId),
          isNull(diagnosticResponses.optionId),
        ),
      )
      .returning()
    if (won) {
      const misconception = correct ? undefined : distractors[optionId]?.misconception
      await db
        .insert(attempts)
        .values({
          userId: actor.userId,
          conceptId: item.conceptId,
          activityType: 'diagnostic',
          diagnosticSessionId: session.id,
          itemId,
          confidence: won.confidence,
          response: { optionId },
          grading: AttemptGrading.parse({
            checks: { verdict: correct, location: null },
            criteria: [],
            rationale: null,
            ...(misconception ? { misconceptions: [misconception] } : {}),
          }),
          score: correct ? 1 : 0,
          maxScore: 1,
          outcome: correct ? 'correct' : 'incorrect',
          assisted: false,
        })
        .onConflictDoNothing()
      stored = won
      session = await maybeIssueFollowUp(db, session, item, won)
    } else {
      stored = (await loadResponse(db, session.id, itemId)) ?? response
    }
  }

  const chosen = stored.optionId ?? optionId
  const correct = stored.correct === true
  const followUp = await followUpFor(db, session, item, stored)
  await completeIfDone(db, session)
  const [source, mastery] = await Promise.all([
    itemSource(db, item),
    masteryOf(db, actor.userId, item.conceptId),
  ])
  const answer = { correct, confidence: stored.confidence, isFollowUp: stored.isFollowUp }
  return {
    correct,
    confidence: stored.confidence,
    finding: classifyFinding(answer, followUp !== null),
    correctOptionId: key.correctOptionId,
    whyYourChoiceIsWrong: correct ? null : (distractors[chosen]?.whyWrong ?? null),
    explanation: key.explanation,
    source,
    followUp,
    mastery,
  }
}
