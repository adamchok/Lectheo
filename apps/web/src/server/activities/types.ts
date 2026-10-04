import type {
  ActivityType,
  CreateActivityResponse,
  Outcome,
  RubricSnapshot,
  SourceRef,
  StumpResult,
  SubmitBodyByType,
} from '@lectheo/contracts'
import type { activities, concepts, items, itemSecrets, messages } from '@lectheo/db'
import type { TaskContext } from '@lectheo/ai'
import type { z } from 'zod'
import type { Actor } from '../auth'
import type { DbLike } from '../db'

/*
 * The seam between the shared /activities core (service.ts, submit.ts) and one module per
 * practice type (spot-flaw.ts, teach-back.ts, later transfer.ts / stump.ts). A feature team
 * changes only its own module; state machine, ownership, quotas, races and mastery stay here.
 */

export type ActivityRow = typeof activities.$inferSelect
export type ConceptRow = typeof concepts.$inferSelect
export type ItemRow = typeof items.$inferSelect
/** 🔒 server-only; never put any part of it in a response unless the handler means to. */
export type ItemSecretsRow = typeof itemSecrets.$inferSelect
export type MessageRow = typeof messages.$inferSelect

/** The type-specific part of the 201 response (everything except id, type, concept). */
export type PublicStart<T extends ActivityType> = Omit<
  Extract<CreateActivityResponse, { type: T }>,
  'id' | 'type' | 'concept'
>
export type SubmitBody<T extends ActivityType> = z.output<(typeof SubmitBodyByType)[T]>

/** What every handler call gets. Loaded once per request by the shared core. */
export interface BaseContext {
  readonly db: DbLike
  readonly actor: Actor
  readonly concept: ConceptRow
  /** packages/ai context wired to quota, governor and the llm_calls ledger. */
  readonly ai: TaskContext
}

export interface StartContext extends BaseContext {
  /** Client-generated activity id (the row doesn't exist yet). */
  readonly activityId: string
  /** Optional persona key from the request (teach-back). */
  readonly persona: string | null
}

export interface ActivityContext extends BaseContext {
  /** Fresh row (re-read after any guarded update the core made for this request). */
  readonly activity: ActivityRow
  /** The bank item (spot_flaw, transfer), or null. Only `publicPayload` is client-safe. */
  readonly item: ItemRow | null
  /** 🔒 item_secrets for `item`. Throws if the activity has no item or the row is missing. */
  readonly secrets: () => Promise<ItemSecretsRow>
  /** Visible messages, oldest first. */
  readonly visibleMessages: () => Promise<MessageRow[]>
}

export interface StartResult {
  readonly itemId: string | null
  /** 🔒 frozen into activities.rubric_snapshot. */
  readonly rubricSnapshot: RubricSnapshot
  readonly persona: string | null
  /** Messages stored right after the row is created (e.g. the teach-back opener). */
  readonly initialMessages?: readonly { role: 'persona' | 'student'; content: string }[]
}

export interface ReplyInput {
  readonly text: string
  /** After this turn was claimed. */
  readonly turnsLeft: number
}

/** spot_flaw: JSON. teach_back: a streaming Response (UI message stream). */
export type ReplyResult = { reply: string; turnsLeft: number } | Response

export interface Criterion {
  readonly id: string
  readonly label: string
  readonly score: number
  readonly max: number
}

export interface GradingResult {
  readonly checks: { verdict: boolean; location: boolean | null } | null
  readonly criteria: readonly Criterion[]
  readonly score: number
  readonly maxScore: number
  readonly outcome: Outcome
  readonly feedback: { guidingQuestion: string | null; hint: string | null }
  readonly rationale: string | null
  readonly misconceptions?: readonly string[]
  /** TaskResult.model of the judge call, or null when no judge ran. */
  readonly judgeModel: string | null
  readonly sources: readonly SourceRef[]
  /** Stump only: referee + answerer result, stored in attempts.grading.stump. */
  readonly stump?: StumpResult
}

export interface Explanation {
  readonly explanation: string
  readonly sources: readonly SourceRef[]
}

export interface FinalReveal {
  readonly explanation: string
  readonly rubric: readonly { id: string; label: string; description: string }[]
}

export interface ActivityTypeHandler<T extends ActivityType = ActivityType> {
  readonly type: T
  readonly turnBudget: number
  /** 0 = no hint ladder (POST /hints → 404). */
  readonly hintsAvailable: number
  /** Submits before the activity closes (default 2: try + Socratic retry). */
  readonly maxTries?: number
  /** An identical body on a later try replays the previous attempt (default: counts as a try). */
  readonly retryNeedsNewBody?: boolean
  /** Pick content and freeze the rubric. Throw ApiError (e.g. 409) if nothing can be served. */
  start(ctx: StartContext): Promise<StartResult>
  /** The type-specific 201 body, rebuilt from the stored row (also used for replays). */
  publicStart(ctx: ActivityContext): Promise<PublicStart<T>>
  /** The turn is already claimed and the student message stored. Persist the persona reply. */
  reply?(ctx: ActivityContext, input: ReplyInput): Promise<ReplyResult>
  /** `n` is 1-based and already counted in hints_used. */
  hint?(ctx: ActivityContext, n: number): Promise<string>
  submit(ctx: ActivityContext, body: SubmitBody<T>, tryNo: number): Promise<GradingResult>
  explanation(ctx: ActivityContext): Promise<Explanation>
  /** Revealed once the activity is closed (F4c.8, API Spec §7). */
  finalReveal(ctx: ActivityContext): Promise<FinalReveal>
}
