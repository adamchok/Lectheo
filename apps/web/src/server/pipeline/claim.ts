import type { LectureStatus, ReprocessFromStep } from '@lectheo/contracts'
import type { z } from 'zod'
import { and, eq, inArray, items, lectures, ne, pipelineSteps } from '@lectheo/db'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { ApiError, invalidState } from '../errors'
import { type Lecture, loadLectureForWrite } from '../ownership'
import { assertIntakeOpen, consume } from '../quota'
import { sourceKind, stepsFrom } from './state'

/*
 * POST /lectures/{id}/process (API Spec §5, Architecture §4.3 "Claiming"): a guarded update plus
 * the partial unique index "one processing lecture per course" close the double-click and the
 * concurrent-dedupe races. ?from= re-runs from a step: later step state is cleared, old items are
 * retired (never deleted), and it counts against the daily `reprocess` quota.
 */

type ReprocessFrom = z.infer<typeof ReprocessFromStep>

const CLAIMABLE: readonly LectureStatus[] = ['draft', 'uploading', 'ready', 'map_ready', 'failed']
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
  await db
    .update(items)
    .set({ status: 'retired' })
    .where(and(eq(items.lectureId, lectureId), ne(items.status, 'retired')))
}

const alreadyProcessing = (): ApiError =>
  new ApiError(
    'already_processing',
    'This lecture, or another one in the same course, is already being processed.',
  )

/** Claims the lecture for processing (status → processing). The caller then starts the workflow. */
export async function claimLecture(
  actor: Actor,
  lectureId: string,
  from: ReprocessFrom | undefined,
  db: DbLike = appDb(),
): Promise<void> {
  const { lecture } = await loadLectureForWrite(actor, lectureId, db)
  await assertIntakeOpen(db)
  if (from) {
    assertFromFits(lecture, from)
    await consume(actor, 'reprocess', db)
  }
  let claimed: boolean
  try {
    claimed = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(lectures)
        .set({ status: 'processing', error: null, progress: null, needsReprocess: false })
        .where(and(eq(lectures.id, lecture.id), inArray(lectures.status, CLAIMABLE)))
        .returning({ id: lectures.id })
      if (!row) return false
      if (from) await resetFrom(tx as unknown as DbLike, lecture.id, from)
      return true
    })
  } catch (err) {
    if (isUniqueViolation(err)) throw alreadyProcessing()
    throw err
  }
  if (!claimed) throw alreadyProcessing()
}
