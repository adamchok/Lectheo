import type { PipelineStep } from '@lectheo/contracts'
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
  fetchTranscriptStep,
  parseTranscriptStep,
  pollTranscriptionStep,
  submitTranscriptionStep,
  type PollStatus,
} from './transcribe'

/*
 * Workflow steps ('use step', ADR-002): full Node access, retried on error (FatalError skips the
 * retries). Arguments and results cross the workflow boundary serialized, so steps take the
 * lecture id and return small JSON; the database is the record. Outside a workflow each one is a
 * plain async call (tests drive them that way).
 */

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
  await markMapReady(appDb(), lectureId)
}

export async function draftItems(lectureId: string): Promise<void> {
  'use step'
  await draftItemsStep(appDb(), lectureId)
}

export async function verifyItems(lectureId: string): Promise<void> {
  'use step'
  await verifyItemsStep(appDb(), lectureId)
}

export async function finishLecture(lectureId: string): Promise<void> {
  'use step'
  await markReady(appDb(), lectureId)
}

export async function failProcessing(
  lectureId: string,
  step: PipelineStep,
  failure?: StepFailure,
): Promise<void> {
  'use step'
  await failLecture(appDb(), lectureId, step, failure)
}
