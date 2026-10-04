import { SubmitBodyByType, type ActivityType, type SubmitResponse } from '@lectheo/contracts'
import { activities, and, attempts, desc, eq } from '@lectheo/db'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, invalidState } from '../errors'
import { buildContext, loadOwnedActivity } from './load'
import { handlerFor } from './registry'
import { masteryFor, withAiErrors } from './service'
import { activitySources } from './sources'
import type { ActivityContext, ActivityTypeHandler, GradingResult } from './types'

/*
 * POST /activities/{id}/submit (API Spec §7, F4c.8, F5). State machine:
 *   active --try 1 (not correct)--> awaiting_retry --try 2--> closed
 *   active --try 1 correct--> closed
 * A handler with maxTries > 2 (stump) stays awaiting_retry until try `maxTries` or a correct one.
 * UNIQUE (activity_id, try_no) is the race guard. Same body again → the stored attempt.
 */

const DEFAULT_MAX_TRIES = 2

type AttemptRow = typeof attempts.$inferSelect

/** Body validation per type (the route can't know the type before loading the activity). */
export function parseSubmitBody(type: ActivityType, raw: unknown): unknown {
  const parsed = SubmitBodyByType[type].safeParse(raw ?? {})
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map((i) => ({
    path: ['body', ...i.path.map(String)].join('.'),
    code: i.code,
    message: i.message,
  }))
  throw new ApiError('validation_failed', undefined, { issues })
}

/** JSON with sorted keys (jsonb reorders keys, so compare canonical forms). */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function findAttempt(db: DbLike, activityId: string, tryNo: number) {
  const [row] = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.activityId, activityId), eq(attempts.tryNo, tryNo)))
    .limit(1)
  return row
}

async function lastAttempt(db: DbLike, activityId: string) {
  const [row] = await db
    .select()
    .from(attempts)
    .where(eq(attempts.activityId, activityId))
    .orderBy(desc(attempts.tryNo))
    .limit(1)
  return row
}

/**
 * A client retry of the previous try (lost response) arrives while the activity is awaiting_retry. Treat it
 * as a duplicate when the body is identical and the student wrote nothing since try 1 (so a
 * teach-back retry, whose body is always {}, needs new explanation first). If no turns are left,
 * nothing new can be written, so the submit counts as the next try. Types without turns (stump)
 * must change the body to get a new try.
 */
async function isDuplicateOf(
  ctx: ActivityContext,
  prev: AttemptRow,
  body: unknown,
): Promise<boolean> {
  if (canonical(prev.response) !== canonical(body)) return false
  const { turnsUsed, turnBudget } = ctx.activity
  if (turnBudget > 0 && turnsUsed >= turnBudget) return false
  const visible = await ctx.visibleMessages()
  return !visible.some((m) => m.role === 'student' && m.createdAt > prev.createdAt)
}

async function replayOrConflict(
  ctx: ActivityContext,
  handler: ActivityTypeHandler,
  stored: AttemptRow,
  body: unknown,
): Promise<SubmitResponse> {
  if (canonical(stored.response) !== canonical(body)) {
    throw invalidState('This try was already submitted.', { tryNo: stored.tryNo })
  }
  const sources = await activitySources(ctx.db, ctx.concept, ctx.item)
  return buildSubmitResponse(ctx, handler, stored, { sources, hint: null })
}

async function buildSubmitResponse(
  ctx: ActivityContext,
  handler: ActivityTypeHandler,
  attempt: AttemptRow,
  extra: Pick<GradingResult, 'sources'> & { hint: string | null },
): Promise<SubmitResponse> {
  const { final } = attempt
  const [mastery, reveal] = await Promise.all([
    masteryFor(ctx.db, ctx.actor.userId, ctx.concept),
    final ? handler.finalReveal(ctx) : Promise.resolve(null),
  ])
  return {
    attemptId: attempt.id,
    tryNo: attempt.tryNo,
    final,
    outcome: attempt.outcome,
    score: attempt.score,
    maxScore: attempt.maxScore,
    checks: attempt.grading.checks,
    criteria: attempt.grading.criteria,
    // F5.3: the guiding question comes before the answer; once final, the explanation replaces it.
    feedback: {
      guidingQuestion: final ? null : (attempt.grading.guidingQuestion ?? null),
      hint: final ? null : extra.hint,
    },
    canRetry: !final,
    explanationAvailable: true,
    sources: [...extra.sources],
    mastery,
    ...(attempt.grading.stump ? { stump: attempt.grading.stump } : {}),
    ...(reveal ? { explanation: reveal.explanation, rubric: [...reveal.rubric] } : {}),
  }
}

export async function submitActivity(
  actor: Actor,
  id: string,
  rawBody: unknown,
  db: DbLike = appDb(),
): Promise<SubmitResponse> {
  const activity = await loadOwnedActivity(db, actor, id)
  const handler = handlerFor(activity.type)
  const body = parseSubmitBody(activity.type, rawBody)
  const ctx = await buildContext(db, actor, activity)

  if (activity.status === 'closed') {
    // A retry of the final submit gets the stored final attempt; anything else is 409.
    const stored = await lastAttempt(db, id)
    if (stored?.final && canonical(stored.response) === canonical(body)) {
      return replayOrConflict(ctx, handler, stored, body)
    }
    throw invalidState('This activity is closed.')
  }
  const prev = activity.status === 'active' ? undefined : await lastAttempt(db, id)
  const tryNo = prev ? prev.tryNo + 1 : 1
  const existing = await findAttempt(db, id, tryNo)
  if (existing) return replayOrConflict(ctx, handler, existing, body)
  if (prev && (await isDuplicateOf(ctx, prev, body))) {
    return replayOrConflict(ctx, handler, prev, body)
  }

  // F6: hints and "Show me" make later tries assisted; the Socratic guiding question does not.
  const assisted = activity.hintsUsed > 0 || activity.explanationShown
  const grading = await withAiErrors(db, () => handler.submit(ctx, body as never, tryNo))
  const final = tryNo >= (handler.maxTries ?? DEFAULT_MAX_TRIES) || grading.outcome === 'correct'

  const [inserted] = await db
    .insert(attempts)
    .values({
      userId: actor.userId,
      conceptId: activity.conceptId,
      activityType: activity.type,
      activityId: id,
      itemId: activity.itemId,
      tryNo,
      final,
      response: body,
      grading: {
        checks: grading.checks,
        criteria: [...grading.criteria],
        rationale: grading.rationale,
        ...(grading.misconceptions ? { misconceptions: [...grading.misconceptions] } : {}),
        guidingQuestion: grading.feedback.guidingQuestion,
        ...(grading.stump ? { stump: grading.stump } : {}),
      },
      score: grading.score,
      maxScore: grading.maxScore,
      outcome: grading.outcome,
      assisted,
      judgeModel: grading.judgeModel,
    })
    .onConflictDoNothing({ target: [attempts.activityId, attempts.tryNo] })
    .returning()
  if (!inserted) {
    const raced = await findAttempt(db, id, tryNo)
    if (!raced) throw new Error(`Attempt ${id}#${tryNo} missing after ON CONFLICT`)
    return replayOrConflict(ctx, handler, raced, body)
  }

  await db
    .update(activities)
    .set({ status: final ? 'closed' : 'awaiting_retry' })
    .where(and(eq(activities.id, id), eq(activities.status, activity.status)))

  return buildSubmitResponse(ctx, handler, inserted, {
    sources: grading.sources,
    hint: grading.feedback.hint,
  })
}
