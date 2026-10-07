import type { LectureStatus, ReprocessFromStep } from '@lectheo/contracts'
import {
  and,
  conceptEdges,
  conceptOccurrences,
  eq,
  inArray,
  items,
  lectures,
  ne,
  pipelineSteps,
  sql,
  usageCounters,
} from '@lectheo/db'
import type { z } from 'zod'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, invalidState } from '../errors'
import { type Lecture, loadLectureForWrite } from '../ownership'
import { assertIntakeOpen, consume } from '../quota'
import { dropOrphanConcepts } from './segments'
import { sourceKind, stepsFrom } from './state'

/*
 * POST /lectures/{id}/process (API Spec §5, Architecture §4.3 "Claiming"): a guarded update plus
 * the partial unique index "one processing lecture per course" close the double-click and the
 * concurrent-dedupe races.
 * - No ?from on a draft/uploading lecture = a fresh run (a new upload after a failure): all of
 *   this lecture's pipeline state is cleared, free of charge. On a failed lecture = resume.
 * - ?from= re-runs from a step: later step state is cleared, old items are retired (never
 *   deleted), and it counts against the daily `reprocess` quota (charged inside the claim).
 * - map_ready is still mid-run (drafting), so it is claimable only with ?from; the old run then
 *   notices it was superseded (steps.ts) and stops.
 * - A run that stopped responding (no activity for STALE_MINUTES) is failed by the next claim in
 *   its course, so a dead run never blocks the lecture or the course forever.
 */

type ReprocessFrom = z.infer<typeof ReprocessFromStep>

const CLAIMABLE: readonly LectureStatus[] = ['draft', 'uploading', 'ready', 'failed']
const FRESH_RUN: readonly LectureStatus[] = ['draft', 'uploading']
/** Steps write progress at least every 15 s while polling and every step otherwise. */
export const STALE_MINUTES = 15
const PG_UNIQUE_VIOLATION = '23505'
const MAX_CAUSE_DEPTH = 5

/** postgres.js / PGlite unique violation, possibly wrapped by drizzle (`cause`). */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let i = 0; i < MAX_CAUSE_DEPTH && current && typeof current === 'object'; i++) {
    if ((current as { code?: unknown }).code === PG_UNIQUE_VIOLATION) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

function assertFromFits(lecture: Lecture, from: ReprocessFrom): void {
  const kind = sourceKind(lecture.source)
  if (kind === 'audio' && from === 'parseTranscript') {
    throw invalidState('This lecture was transcribed from audio. Re-run it from transcription.')
  }
  if (kind === 'transcript' && from === 'submitTranscription') {
    throw invalidState('This lecture has no audio to transcribe.')
  }
  if (from === 'submitTranscription' && !lecture.audioPath) {
    throw invalidState('The audio was deleted after transcription. Upload it again to re-run.')
  }
}

/** Fails runs in the course that stopped responding (lecture and its steps both idle). */
async function releaseStalled(db: DbLike, courseId: string): Promise<void> {
  const stale = sql.raw(`interval '${STALE_MINUTES} minutes'`)
  await db
    .update(lectures)
    .set({
      status: 'failed',
      error: sql`jsonb_build_object('step', coalesce("lectures"."progress"->>'step',
        'parseTranscript'), 'code', 'stalled', 'message',
        'Processing stopped responding. Retry to continue where it left off.')`,
    })
    .where(
      and(
        eq(lectures.courseId, courseId),
        inArray(lectures.status, ['processing', 'map_ready']),
        sql`"lectures"."updated_at" < now() - ${stale}`,
        sql`not exists (select 1 from pipeline_steps ps where ps.lecture_id = "lectures"."id"
          and ps.updated_at >= now() - ${stale})`,
      ),
    )
}

const retireItems = (db: DbLike, lectureId: string) =>
  db
    .update(items)
    .set({ status: 'retired' })
    .where(and(eq(items.lectureId, lectureId), ne(items.status, 'retired')))

/** Clears state from `from` on, inside the claim transaction. */
async function resetFrom(db: DbLike, lectureId: string, from: ReprocessFrom): Promise<void> {
  await db
    .delete(pipelineSteps)
    .where(
      and(eq(pipelineSteps.lectureId, lectureId), inArray(pipelineSteps.step, stepsFrom(from))),
    )
  if (from === 'parseTranscript') {
    // parseTranscript is a no-op while segments exist; this asks it to re-parse the raw file.
    await db
      .insert(pipelineSteps)
      .values({ lectureId, step: 'parseTranscript', status: 'pending', output: { reparse: true } })
  }
  if (from === 'submitTranscription') {
    await db.update(lectures).set({ sttJobId: null }).where(eq(lectures.id, lectureId))
  }
  await retireItems(db, lectureId)
}

/**
 * A fresh run (new upload): nothing from an earlier run may be reused. Segments are kept (the
 * upload just wrote them); the old grounding, items and transcription job go.
 */
async function resetFresh(db: DbLike, lecture: Lecture): Promise<void> {
  await db.delete(pipelineSteps).where(eq(pipelineSteps.lectureId, lecture.id))
  // Chapters cite segment indexes of the old run; validateGraph writes new ones.
  await db
    .update(lectures)
    .set({ sttJobId: null, chapters: null })
    .where(eq(lectures.id, lecture.id))
  await retireItems(db, lecture.id)
  await db.delete(conceptOccurrences).where(eq(conceptOccurrences.lectureId, lecture.id))
  await db.delete(conceptEdges).where(eq(conceptEdges.lectureId, lecture.id))
  await dropOrphanConcepts(db, lecture.courseId)
}

const alreadyProcessing = (): ApiError =>
  new ApiError(
    'already_processing',
    'This lecture, or another one in the same course, is already being processed.',
  )

export interface Claim {
  /** True when this claim used one of today's re-runs (refund it if the run can't start). */
  reprocessCharged: boolean
  /** When the claim was made: a refund goes back to that UTC day's counter. */
  claimedAt: Date
}

/** Claims the lecture for processing (status → processing). The caller then starts the workflow. */
export async function claimLecture(
  actor: Actor,
  lectureId: string,
  from: ReprocessFrom | undefined,
  db: DbLike = appDb(),
): Promise<Claim> {
  const claimedAt = new Date()
  const { lecture } = await loadLectureForWrite(actor, lectureId, db)
  await assertIntakeOpen(db)
  if (from) assertFromFits(lecture, from)
  const claimable = from ? [...CLAIMABLE, 'map_ready' as const] : CLAIMABLE
  let claimed: boolean
  try {
    claimed = await db.transaction(async (raw) => {
      const tx = raw as unknown as DbLike
      await releaseStalled(tx, lecture.courseId)
      const [row] = await tx
        .update(lectures)
        .set({
          status: 'processing',
          error: null,
          progress: null,
          needsReprocess: false,
          workflowRunId: null,
        })
        .where(and(eq(lectures.id, lecture.id), inArray(lectures.status, claimable)))
        .returning({ id: lectures.id })
      if (!row) return false
      if (from) {
        // Inside the transaction: a 429 rolls the claim back, a lost claim is never charged.
        await consume(actor, 'reprocess', tx, claimedAt)
        await resetFrom(tx, lecture.id, from)
      } else if (FRESH_RUN.includes(lecture.status)) {
        await resetFresh(tx, lecture)
      }
      return true
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyProcessing()
    throw err
  }
  if (!claimed) throw alreadyProcessing()
  return { reprocessCharged: Boolean(from), claimedAt }
}

/** Gives back the re-run charged at `now` (the claim time) when the workflow could not start. */
export async function refundReprocess(
  actor: Actor,
  db: DbLike = appDb(),
  now = new Date(),
): Promise<void> {
  await db
    .update(usageCounters)
    .set({ count: sql`greatest(${usageCounters.count} - 1, 0)` })
    .where(
      and(
        eq(usageCounters.userId, actor.userId),
        eq(usageCounters.day, now.toISOString().slice(0, 10)),
        eq(usageCounters.metric, 'reprocess'),
      ),
    )
}
