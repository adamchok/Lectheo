import { eq, lectures } from '@lectheo/db'
import { start } from 'workflow/api'
import { appDb, type DbLike } from '../db'
import { ApiError } from '../errors'
import { failLecture, pipelinePath, sourceKind } from './state'
import { processLecture } from './workflow'

const reasonOf = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/**
 * Starts the processLecture workflow for a claimed lecture and records its run id. If the
 * workflow engine refuses the run, the claim is released as a failure the user can retry
 * (otherwise the lecture would sit in `processing` until the stale-claim sweep) and
 * `onStartFailed` runs (e.g. refund a re-run). Bookkeeping errors after a successful start are
 * logged, never surfaced: the run is already going.
 */
export async function startProcessing(
  lectureId: string,
  opts: { db?: DbLike; onStartFailed?: () => Promise<void> } = {},
): Promise<void> {
  const db = opts.db ?? appDb()
  let runId: string
  try {
    runId = (await start(processLecture, [lectureId])).runId
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'workflow_start_failed', lectureId, reason: reasonOf(err) }),
    )
    await releaseClaim(db, lectureId)
    await opts
      .onStartFailed?.()
      .catch((refundErr: unknown) =>
        console.error(JSON.stringify({ event: 'refund_failed', reason: reasonOf(refundErr) })),
      )
    throw new ApiError('upstream_unavailable')
  }
  try {
    await db.update(lectures).set({ workflowRunId: runId }).where(eq(lectures.id, lectureId))
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'run_id_write_failed', lectureId, reason: reasonOf(err) }),
    )
  }
}

async function releaseClaim(db: DbLike, lectureId: string): Promise<void> {
  try {
    const [row] = await db
      .select({ source: lectures.source })
      .from(lectures)
      .where(eq(lectures.id, lectureId))
      .limit(1)
    const first = pipelinePath(sourceKind(row?.source ?? 'transcript'))[0] ?? 'parseTranscript'
    await failLecture(db, lectureId, first, {
      code: 'upstream_unavailable',
      message: 'We couldn’t start processing. Please retry.',
    })
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'release_claim_failed', lectureId, reason: reasonOf(err) }),
    )
  }
}
