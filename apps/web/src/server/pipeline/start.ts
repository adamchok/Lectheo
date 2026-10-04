import { eq, lectures } from '@lectheo/db'
import { start } from 'workflow/api'
import { appDb, type DbLike } from '../db'
import { ApiError } from '../errors'
import { failLecture, pipelinePath, sourceKind } from './state'
import { processLecture } from './workflow'

/**
 * Starts the processLecture workflow for a claimed lecture and records its run id. If the
 * workflow engine refuses the run, the claim is released as a failure the user can retry
 * (otherwise the lecture would sit in `processing` forever).
 */
export async function startProcessing(lectureId: string, db: DbLike = appDb()): Promise<void> {
  let runId: string
  try {
    runId = (await start(processLecture, [lectureId])).runId
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ event: 'workflow_start_failed', lectureId, reason }))
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
    throw new ApiError('upstream_unavailable')
  }
  await db.update(lectures).set({ workflowRunId: runId }).where(eq(lectures.id, lectureId))
}
