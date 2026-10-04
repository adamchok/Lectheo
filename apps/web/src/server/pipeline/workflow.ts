import type { PipelineStep } from '@lectheo/contracts'
import { sleep } from 'workflow'
import {
  abandonStt,
  alignMarkers,
  beginPipeline,
  draftItems,
  extractConcepts,
  failProcessing,
  fetchTranscript,
  finishLecture,
  layoutMap,
  mapReady,
  parseTranscript,
  pollTranscription,
  submitTranscription,
  validateGraph,
  verifyItems,
} from './steps'

/*
 * processLecture (Architecture §4.3, ADR-002): durable Vercel Workflow. The workflow function only
 * orchestrates (sandboxed, deterministic); every side effect is a step in ./steps. No webhook:
 * transcription is polled every 15 s for at most 60 min. Any step that still fails after its
 * retries (or throws FatalError) fails the lecture with that step's recorded reason.
 */

const POLL_INTERVAL = '15s'
/** 240 × 15 s = 60 min. */
const MAX_POLLS = 240
const STT_TIMEOUT = {
  code: 'stt_timeout',
  message: 'Transcription took longer than an hour. Try uploading a transcript instead.',
}

export async function processLecture(lectureId: string): Promise<'ready' | 'failed'> {
  'use workflow'
  let current: PipelineStep = 'parseTranscript'
  try {
    if ((await beginPipeline(lectureId)) === 'audio') {
      current = 'submitTranscription'
      await submitTranscription(lectureId)
      current = 'pollTranscription'
      let polls = 1
      while ((await pollTranscription(lectureId)) !== 'completed') {
        if (polls >= MAX_POLLS) {
          await abandonStt(lectureId)
          await failProcessing(lectureId, current, STT_TIMEOUT)
          return 'failed'
        }
        polls += 1
        await sleep(POLL_INTERVAL)
      }
      current = 'fetchTranscript'
      await fetchTranscript(lectureId)
    } else {
      await parseTranscript(lectureId)
    }
    current = 'extractConcepts'
    await extractConcepts(lectureId)
    current = 'validateGraph'
    await validateGraph(lectureId)
    current = 'layoutMap'
    await layoutMap(lectureId)
    current = 'alignMarkers'
    await alignMarkers(lectureId)
    await mapReady(lectureId)
    current = 'draftItems'
    await draftItems(lectureId)
    current = 'verifyItems'
    await verifyItems(lectureId)
    await finishLecture(lectureId)
    return 'ready'
  } catch {
    try {
      await failProcessing(lectureId, current)
    } catch {
      // failProcessing already logs; a lecture left in `processing` is released by the next claim.
    }
    return 'failed'
  }
}
