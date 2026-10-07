import type { PipelineStep } from '@lectheo/contracts'
import { eq, lectures } from '@lectheo/db'
import { getWorkflowMetadata } from 'workflow'
import { appDb } from '../db'
import { sttClient } from '../stt/assemblyai'
import { alignMarkersStep, extractConceptsStep, layoutMapStep, validateGraphStep } from './graph'
import { draftItemsStep, verifyItemsStep } from './items'
import { loadLecture } from './segments'
import {
  failLecture,
  markMapReady,
  markReady,
  sourceKind,
  type SourceKind,
  type StepFailure,
} from './state'
import {
  abandonTranscription,
  fetchTranscriptStep,
  parseTranscriptStep,
  pollTranscriptionStep,
  submitTranscriptionStep,
  type PollStatus,
} from './transcribe'
import { transcribeVideoStep, type VideoProgress } from './transcribe-video'

/*
 * Workflow steps ('use step', ADR-002): full Node access, retried on error (FatalError skips the
 * retries). Arguments and results cross the workflow boundary serialized, so steps take the
 * lecture id and return small JSON; the database is the record. Outside a workflow each one is a
 * plain async call (tests drive them that way).
 */

/** This step's workflow run id, or null outside a workflow (tests, direct calls). */
function currentRunId(): string | null {
  try {
    return getWorkflowMetadata().workflowRunId
  } catch {
    return null
  }
}

/**
 * True when a later claim (?from= while map_ready) started another run for this lecture: the old
 * run stops writing so the two never draft, verify or finish the same lecture together.
 */
// ponytail: a ?from claim nulls workflow_run_id and start() writes the new id a moment later; in
// that window the old run still passes this guard. extract/validate steps aren't guarded (they run
// before map_ready, which a new claim can't overlap). Upgrade path: pass a claim token as a
// workflow argument and compare that instead of the run id.
async function superseded(lectureId: string): Promise<boolean> {
  const runId = currentRunId()
  if (!runId) return false
  const [row] = await appDb()
    .select({ runId: lectures.workflowRunId })
    .from(lectures)
    .where(eq(lectures.id, lectureId))
    .limit(1)
  return row?.runId != null && row.runId !== runId
}

export async function beginPipeline(lectureId: string): Promise<SourceKind> {
  'use step'
  return sourceKind((await loadLecture(appDb(), lectureId)).source)
}

export async function parseTranscript(lectureId: string): Promise<void> {
  'use step'
  await parseTranscriptStep(appDb(), lectureId)
}

export async function submitTranscription(lectureId: string): Promise<void> {
  'use step'
  await submitTranscriptionStep(appDb(), lectureId, sttClient())
}

export async function pollTranscription(lectureId: string): Promise<PollStatus> {
  'use step'
  return pollTranscriptionStep(appDb(), lectureId, sttClient())
}

export async function fetchTranscript(lectureId: string): Promise<void> {
  'use step'
  await fetchTranscriptStep(appDb(), lectureId, sttClient())
}

/** One wave of chunks per call; the workflow repeats it until `done`. */
export async function transcribeVideo(lectureId: string): Promise<VideoProgress> {
  'use step'
  return transcribeVideoStep(appDb(), lectureId)
}

export async function extractConcepts(lectureId: string): Promise<void> {
  'use step'
  await extractConceptsStep(appDb(), lectureId)
}

export async function validateGraph(lectureId: string): Promise<void> {
  'use step'
  await validateGraphStep(appDb(), lectureId)
}

export async function layoutMap(lectureId: string): Promise<void> {
  'use step'
  await layoutMapStep(appDb(), lectureId)
}

export async function alignMarkers(lectureId: string): Promise<void> {
  'use step'
  await alignMarkersStep(appDb(), lectureId)
}

export async function mapReady(lectureId: string): Promise<void> {
  'use step'
  if (await superseded(lectureId)) return
  await markMapReady(appDb(), lectureId)
}

export async function draftItems(lectureId: string): Promise<void> {
  'use step'
  if (await superseded(lectureId)) return
  await draftItemsStep(appDb(), lectureId)
}

export async function verifyItems(lectureId: string): Promise<void> {
  'use step'
  if (await superseded(lectureId)) return
  await verifyItemsStep(appDb(), lectureId)
}

export async function finishLecture(lectureId: string): Promise<void> {
  'use step'
  if (await superseded(lectureId)) return
  await markReady(appDb(), lectureId)
}

export async function failProcessing(
  lectureId: string,
  step: PipelineStep,
  failure?: StepFailure,
): Promise<void> {
  'use step'
  if (await superseded(lectureId)) return
  try {
    await failLecture(appDb(), lectureId, step, failure)
  } catch (err) {
    // Never fail the run over this: a stuck `processing` lecture is released by the next claim.
    const reason = err instanceof Error ? err.message : String(err)
    console.error(JSON.stringify({ event: 'fail_lecture_failed', lectureId, step, reason }))
  }
}

export async function abandonStt(lectureId: string): Promise<void> {
  'use step'
  await abandonTranscription(appDb(), lectureId, sttClient())
}
