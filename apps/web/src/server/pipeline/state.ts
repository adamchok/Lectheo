import { AiPausedError, FatalTaskError } from '@lectheo/ai'
import { PIPELINE_STEPS, type LectureSource, type PipelineStep } from '@lectheo/contracts'
import { and, eq, inArray, lectures, pipelineSteps, sql } from '@lectheo/db'
import { FatalError } from 'workflow'
import type { DbLike } from '../db'
import { ApiError, withoutQueryParams } from '../errors'
import { markAiDegraded } from '../quota'

/*
 * pipeline_steps bookkeeping (Architecture §4.3, ADR-002): every step records running / done /
 * failed, skips work already done, and keeps only small outputs. Failures are classified once
 * here: validation-type errors become workflow FatalErrors (no retry), everything else is
 * rethrown so the workflow's default retries apply.
 */

const TRANSCRIPT_PATH = [
  'parseTranscript',
  'extractConcepts',
  'validateGraph',
  'layoutMap',
  'alignMarkers',
  'draftItems',
  'verifyItems',
] as const satisfies readonly PipelineStep[]

const AUDIO_PATH = [
  'submitTranscription',
  'pollTranscription',
  'fetchTranscript',
  ...TRANSCRIPT_PATH.slice(1),
] as const satisfies readonly PipelineStep[]

const YOUTUBE_PATH = [
  'transcribeVideo',
  ...TRANSCRIPT_PATH.slice(1),
] as const satisfies readonly PipelineStep[]

export type SourceKind = 'audio' | 'transcript' | 'youtube'

export function sourceKind(source: LectureSource): SourceKind {
  if (source === 'youtube') return 'youtube'
  return source === 'audio' || source === 'live' ? 'audio' : 'transcript'
}

const PATHS: Readonly<Record<SourceKind, readonly PipelineStep[]>> = {
  audio: AUDIO_PATH,
  transcript: TRANSCRIPT_PATH,
  youtube: YOUTUBE_PATH,
}

/** The steps a lecture runs through, in order (drives lectures.progress). */
export function pipelinePath(kind: SourceKind): readonly PipelineStep[] {
  return PATHS[kind]
}

/** Every step at or after `from` in the shared enum order (cleared by ?from=). */
export function stepsFrom(from: PipelineStep): PipelineStep[] {
  return PIPELINE_STEPS.slice(PIPELINE_STEPS.indexOf(from))
}

export interface StepFailure {
  code: string
  message: string
}

/** A known, non-retryable pipeline failure with a user-facing message. */
export class PipelineError extends Error {
  override readonly name = 'PipelineError'
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const FATAL_API_CODES = new Set(['ai_paused', 'intake_paused', 'quota_exceeded', 'invalid_state'])

function classify(err: unknown): StepFailure & { fatal: boolean } {
  if (err instanceof PipelineError) return { code: err.code, message: err.message, fatal: true }
  if (err instanceof FatalTaskError) {
    return {
      code: 'invalid_ai_output',
      message: "The AI's output failed our checks twice. Retrying usually fixes this.",
      fatal: true,
    }
  }
  if (err instanceof AiPausedError) {
    return { code: 'ai_paused', message: 'AI features are paused for now.', fatal: true }
  }
  if (err instanceof ApiError) {
    return { code: err.code, message: err.message, fatal: FATAL_API_CODES.has(err.code) }
  }
  if (err instanceof FatalError) return { code: 'failed', message: err.message, fatal: true }
  return {
    code: 'upstream_unavailable',
    message: 'A service we depend on failed. Please retry in a minute.',
    fatal: false,
  }
}

const stepRow = (lectureId: string, step: PipelineStep) =>
  and(eq(pipelineSteps.lectureId, lectureId), eq(pipelineSteps.step, step))

export async function readStep(
  db: DbLike,
  lectureId: string,
  step: PipelineStep,
): Promise<{ status: string; output: unknown } | null> {
  const [row] = await db
    .select({ status: pipelineSteps.status, output: pipelineSteps.output })
    .from(pipelineSteps)
    .where(stepRow(lectureId, step))
    .limit(1)
  return row ?? null
}

/** The step's stored output object (or {}), e.g. flags a re-run or a retry must see. */
export async function stepOutput<T extends object>(
  db: DbLike,
  lectureId: string,
  step: PipelineStep,
): Promise<Partial<T>> {
  const out = (await readStep(db, lectureId, step))?.output
  return out && typeof out === 'object' ? (out as Partial<T>) : {}
}

/** Merges keys into a step's output without touching its status. */
export async function mergeStepOutput(
  db: DbLike,
  lectureId: string,
  step: PipelineStep,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(pipelineSteps)
    .set({
      output: sql`coalesce(${pipelineSteps.output}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
    })
    .where(stepRow(lectureId, step))
}

async function setProgress(db: DbLike, lectureId: string, step: PipelineStep): Promise<void> {
  const [lecture] = await db
    .select({ source: lectures.source })
    .from(lectures)
    .where(eq(lectures.id, lectureId))
    .limit(1)
  if (!lecture) return
  const path = pipelinePath(sourceKind(lecture.source))
  // explainConcepts runs beside the item steps and never shows as progress.
  if (!path.includes(step)) return
  const done = path.indexOf(step)
  await db
    .update(lectures)
    .set({ progress: { step, done, total: path.length } })
    .where(eq(lectures.id, lectureId))
}

interface RunStepOptions<T> {
  /** Polling steps return "not yet" without finishing; default: every return finishes the step. */
  isDone?: (output: T) => boolean
}

/**
 * Runs one pipeline step idempotently: returns the stored output when the step is already done,
 * otherwise records the attempt, runs `fn`, and stores its (small, JSON) output.
 */
export async function runStep<T>(
  db: DbLike,
  lectureId: string,
  step: PipelineStep,
  fn: () => Promise<T>,
  options: RunStepOptions<T> = {},
): Promise<T> {
  const existing = await readStep(db, lectureId, step)
  if (existing?.status === 'done') return existing.output as T

  await db
    .insert(pipelineSteps)
    .values({ lectureId, step, status: 'running', attempts: 1 })
    .onConflictDoUpdate({
      target: [pipelineSteps.lectureId, pipelineSteps.step],
      set: { status: 'running', attempts: sql`${pipelineSteps.attempts} + 1` },
    })
  await setProgress(db, lectureId, step)

  try {
    const output = await fn()
    if (options.isDone?.(output) ?? true) {
      await db
        .update(pipelineSteps)
        .set({ status: 'done', output: output ?? null })
        .where(stepRow(lectureId, step))
    }
    return output
  } catch (err) {
    const { fatal, ...failure } = classify(err)
    if (err instanceof AiPausedError) await markAiDegraded(db)
    await db.update(pipelineSteps).set({ status: 'failed' }).where(stepRow(lectureId, step))
    // Keeps flags already in the output (e.g. verifyItems' redraft round) for the retry.
    await mergeStepOutput(db, lectureId, step, { error: failure })
    console.warn(JSON.stringify({ event: 'pipeline_step_failed', lectureId, step, ...failure }))
    // The workflow runtime logs what a step throws: never a failed query's params.
    throw fatal ? new FatalError(`${failure.code}: ${failure.message}`) : withoutQueryParams(err)
  }
}

/** Generic message for a step that failed without a recorded reason (e.g. retries exhausted). */
const UNKNOWN_FAILURE: StepFailure = {
  code: 'upstream_unavailable',
  message: 'Processing stopped unexpectedly. Please retry.',
}

/**
 * status = failed + lectures.error {step, code, message} (the failing step's recorded reason
 * unless `failure` is given). Guarded: only a lecture still being processed is failed.
 */
export async function failLecture(
  db: DbLike,
  lectureId: string,
  step: PipelineStep,
  failure?: StepFailure,
): Promise<void> {
  const recorded = (await stepOutput<{ error: StepFailure }>(db, lectureId, step)).error
  const reason = failure ?? recorded ?? UNKNOWN_FAILURE
  await db
    .update(lectures)
    .set({ status: 'failed', error: { step, code: reason.code, message: reason.message } })
    .where(and(eq(lectures.id, lectureId), inArray(lectures.status, ['processing', 'map_ready'])))
}

/** processing → map_ready once the map exists (questions still being prepared). */
export async function markMapReady(db: DbLike, lectureId: string): Promise<void> {
  await db
    .update(lectures)
    .set({ status: 'map_ready' })
    .where(and(eq(lectures.id, lectureId), eq(lectures.status, 'processing')))
}

/** → ready, progress complete. */
export async function markReady(db: DbLike, lectureId: string): Promise<void> {
  const [lecture] = await db
    .select({ source: lectures.source })
    .from(lectures)
    .where(eq(lectures.id, lectureId))
    .limit(1)
  const total = lecture ? pipelinePath(sourceKind(lecture.source)).length : 0
  await db
    .update(lectures)
    .set({ status: 'ready', progress: { step: null, done: total, total }, error: null })
    .where(and(eq(lectures.id, lectureId), inArray(lectures.status, ['processing', 'map_ready'])))
}
