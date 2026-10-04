import {
  SpotFlawPublicPayload,
  SubmitStump,
  TransferPublicPayload,
  type ActivityResponse,
  type ActivityType,
  type CreateActivityResponse,
  type MasterySummary,
  type StumpResult,
} from '@lectheo/contracts'
import { activities, and, asc, attempts, eq, lt, messages, ne, sql } from '@lectheo/db'
import { aiContext, toApiError } from '../ai-hooks'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, invalidState, notFound } from '../errors'
import { loadMasteryForUser } from '../mastery'
import { consume } from '../quota'
import { buildContext, findActivity, loadConceptForRead, loadOwnedActivity } from './load'
import { handlerFor } from './registry'
import type {
  ActivityContext,
  ActivityRow,
  ConceptRow,
  Explanation,
  FinalReveal,
  ReplyResult,
} from './types'

/*
 * Shared, type-agnostic /activities logic (API Spec §7, ADR-007). Type modules plug in through
 * ActivityTypeHandler; everything here is the same for every type. Submit lives in submit.ts.
 */

export interface CreateActivityInput {
  id: string
  conceptId: string
  type: ActivityType
  persona?: string
}

/** Rethrows packages/ai errors as API errors (ai_paused, upstream_unavailable). */
export async function withAiErrors<T>(db: DbLike, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw await toApiError(err, db)
  }
}

async function describe(ctx: ActivityContext): Promise<CreateActivityResponse> {
  const handler = handlerFor(ctx.activity.type)
  const start = await handler.publicStart(ctx)
  const concept = { id: ctx.concept.id, name: ctx.concept.name }
  return {
    id: ctx.activity.id,
    type: ctx.activity.type,
    concept,
    ...start,
  } as CreateActivityResponse
}

/** Replay of an existing id: only the same user + type gets it back; anyone else gets 404. */
async function replay(db: DbLike, actor: Actor, row: ActivityRow, type: ActivityType) {
  if (row.userId !== actor.userId || row.type !== type) throw notFound()
  return describe(await buildContext(db, actor, row))
}

/** POST /activities: idempotent on the client id (INSERT … ON CONFLICT (id) DO NOTHING). */
export async function createActivity(
  actor: Actor,
  input: CreateActivityInput,
  db: DbLike = appDb(),
): Promise<CreateActivityResponse> {
  const handler = handlerFor(input.type)
  const existing = await findActivity(db, input.id)
  if (existing) return replay(db, actor, existing, input.type)

  // ponytail: consumed before start, so a 409 bank_empty still costs one unit (no refund, like
  // every quota here); refund in a catch around start() if students hit it in practice.
  await consume(actor, 'activities', db)
  const concept = await loadConceptForRead(db, actor, input.conceptId)
  const ai = aiContext({ actor, db })
  const base = { db, actor, concept, ai, activityId: input.id, persona: input.persona ?? null }
  const start = await withAiErrors(db, () => handler.start(base))

  const [row] = await db
    .insert(activities)
    .values({
      id: input.id,
      userId: actor.userId,
      conceptId: concept.id,
      type: input.type,
      itemId: start.itemId,
      persona: start.persona,
      turnBudget: handler.turnBudget,
      rubricSnapshot: start.rubricSnapshot,
    })
    .onConflictDoNothing({ target: activities.id })
    .returning()
  if (!row) {
    const raced = await findActivity(db, input.id)
    if (!raced) throw new Error(`Activity ${input.id} missing after ON CONFLICT`)
    return replay(db, actor, raced, input.type)
  }
  for (const m of start.initialMessages ?? []) {
    await db.insert(messages).values({ activityId: row.id, role: m.role, content: m.content })
  }
  return describe(await buildContext(db, actor, row, concept))
}

function scenarioOf(ctx: ActivityContext): ActivityResponse['scenario'] {
  if (ctx.item?.kind !== 'spot_flaw') return null
  return { sentences: SpotFlawPublicPayload.parse(ctx.item.publicPayload).sentences }
}

/** Stump tries carry the student's own question + key and the referee result (reloads). */
function stumpTry(stump: StumpResult | undefined, response: unknown) {
  const body = SubmitStump.safeParse(response)
  if (!stump || !body.success) return {}
  return { stump: { ...stump, question: body.data.question, studentKey: body.data.answerKey } }
}

/** GET /activities/{id}: visible messages only; tries from attempts. */
export async function getActivity(
  actor: Actor,
  id: string,
  db: DbLike = appDb(),
): Promise<ActivityResponse> {
  const ctx = await buildContext(db, actor, await loadOwnedActivity(db, actor, id))
  const [visible, tries] = await Promise.all([
    ctx.visibleMessages(),
    db.select().from(attempts).where(eq(attempts.activityId, id)).orderBy(asc(attempts.tryNo)),
  ])
  const { activity } = ctx
  return {
    id: activity.id,
    type: activity.type,
    concept: { id: ctx.concept.id, name: ctx.concept.name },
    status: activity.status,
    turnsUsed: activity.turnsUsed,
    turnBudget: activity.turnBudget,
    hintsUsed: activity.hintsUsed,
    scenario: scenarioOf(ctx),
    ...(ctx.item?.kind === 'transfer'
      ? { prompt: TransferPublicPayload.parse(ctx.item.publicPayload).prompt }
      : {}),
    tries: tries.map((t) => ({
      tryNo: t.tryNo,
      outcome: t.outcome,
      feedback: {
        guidingQuestion: t.final ? null : (t.grading.guidingQuestion ?? null),
        hint: null,
      },
      ...stumpTry(t.grading.stump, t.response),
    })),
    messages: visible.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  }
}

/**
 * Guarded turn claim (Data Model invariant 4). Allowed while the activity isn't closed, so the
 * student can keep questioning between try 1 and the retry. 409 when the budget is used up.
 */
export async function claimTurn(db: DbLike, actor: Actor, id: string): Promise<ActivityRow> {
  const [row] = await db
    .update(activities)
    .set({ turnsUsed: sql`${activities.turnsUsed} + 1` })
    .where(
      and(
        eq(activities.id, id),
        eq(activities.userId, actor.userId),
        ne(activities.status, 'closed'),
        lt(activities.turnsUsed, activities.turnBudget),
      ),
    )
    .returning()
  if (!row) throw invalidState('No questions left in this activity.', { reason: 'turns_used' })
  return row
}

/** POST /activities/{id}/messages → JSON (spot_flaw) or a UI message stream (teach_back). */
export async function postMessage(
  actor: Actor,
  id: string,
  text: string,
  db: DbLike = appDb(),
): Promise<ReplyResult> {
  const current = await loadOwnedActivity(db, actor, id)
  const handler = handlerFor(current.type)
  const reply = handler.reply
  if (!reply) throw notFound()
  const activity = await claimTurn(db, actor, id)
  await db.insert(messages).values({ activityId: id, role: 'student', content: text })
  const ctx = await buildContext(db, actor, activity)
  const turnsLeft = activity.turnBudget - activity.turnsUsed
  // ponytail: a failed reply still uses the turn (no refund), like quotas.
  return withAiErrors(db, () => reply.call(handler, ctx, { text, turnsLeft }))
}

/** POST /activities/{id}/hints: guarded increment up to the handler's ladder length. */
export async function takeHint(
  actor: Actor,
  id: string,
  db: DbLike = appDb(),
): Promise<{ hint: string; hintsUsed: number; hintsLeft: number }> {
  const current = await loadOwnedActivity(db, actor, id)
  const handler = handlerFor(current.type)
  if (!handler.hint || handler.hintsAvailable === 0) throw notFound()
  const [row] = await db
    .update(activities)
    .set({ hintsUsed: sql`${activities.hintsUsed} + 1` })
    .where(
      and(
        eq(activities.id, id),
        eq(activities.userId, actor.userId),
        ne(activities.status, 'closed'),
        lt(activities.hintsUsed, handler.hintsAvailable),
      ),
    )
    .returning()
  if (!row) throw invalidState('No hints left.', { reason: 'hints_used' })
  const hint = await handler.hint(await buildContext(db, actor, row), row.hintsUsed)
  return { hint, hintsUsed: row.hintsUsed, hintsLeft: handler.hintsAvailable - row.hintsUsed }
}

/** POST /activities/{id}/explanation ("Show me"): marks later tries assisted before the final. */
export async function showExplanation(
  actor: Actor,
  id: string,
  db: DbLike = appDb(),
): Promise<Explanation & { rubric?: FinalReveal['rubric'] }> {
  const current = await loadOwnedActivity(db, actor, id)
  const handler = handlerFor(current.type)
  const [row] = await db
    .update(activities)
    .set({ explanationShown: true })
    .where(
      and(
        eq(activities.id, id),
        eq(activities.userId, actor.userId),
        ne(activities.status, 'closed'),
      ),
    )
    .returning()
  const ctx = await buildContext(db, actor, row ?? current)
  const explanation = await handler.explanation(ctx)
  // Closed: this is the reopen path, so it also carries the rubric the final submit revealed.
  if (current.status !== 'closed') return explanation
  return { ...explanation, rubric: (await handler.finalReveal(ctx)).rubric }
}

/** Mastery for one concept, recomputed on read (ADR-008). */
export async function masteryFor(
  db: DbLike,
  userId: string,
  concept: Pick<ConceptRow, 'id'>,
): Promise<MasterySummary> {
  const result = (await loadMasteryForUser(db, userId, [concept.id])).get(concept.id)
  if (!result) throw new ApiError('internal_error')
  return {
    conceptId: concept.id,
    state: result.state,
    confidentMistake: result.confidentMistake,
    reasons: [...result.reasons],
  }
}
