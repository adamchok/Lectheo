import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { buildPrompt, googleRequest, PROMPT_VERSION, stamp } from './prompt'
import { TranscribeChunkOutput, type TranscribeChunkInput } from './schema'

/** AI_FAKE: a video id whose clips have no speech (tests the "no speech" path). */
export const FAKE_SILENT_VIDEO_ID = 'fakeSilent0'

const FAKE_SENTENCES = [
  'Today we are going to talk about how memory works and what a pointer really is.',
  'A pointer is just a variable that stores the address of another value in memory.',
  'When you call malloc, you ask the operating system for a chunk of memory on the heap.',
  'And when you are done with that memory, you have to give it back by calling free.',
  'So a linked list is a chain of nodes, and each node points to the next one in the list.',
  'A hash table uses a hash function to decide which bucket each of the keys goes into.',
] as const
const FAKE_CUE_MS = 15_000

/** Deterministic cues every 15 s across the clip, on the whole-video timeline. */
export function fakeTranscribeChunk(input: TranscribeChunkInput): TranscribeChunkOutput {
  if (input.videoId === FAKE_SILENT_VIDEO_ID) return { cues: [] }
  const cues = []
  for (let t = input.startMs; t + 1000 <= input.endMs; t += FAKE_CUE_MS) {
    const i = Math.floor(t / FAKE_CUE_MS) % FAKE_SENTENCES.length
    const end = Math.min(t + FAKE_CUE_MS - 1000, input.endMs)
    cues.push({ start: stamp(t), end: stamp(end), text: FAKE_SENTENCES[i] ?? '' })
  }
  return { cues }
}

/**
 * One 2-minute clip of a YouTube video → H:MM:SS cues (F10.5). Role `transcriber`: the direct
 * Google API only (ADR-017); the pipeline converts, stitches and validates the cues.
 */
export const transcribeChunkTask = defineTask<TranscribeChunkInput, TranscribeChunkOutput>({
  name: 'transcribeChunk',
  role: 'transcriber',
  promptVersion: PROMPT_VERSION,
  schema: TranscribeChunkOutput,
  buildPrompt,
  google: googleRequest,
  maxOutputTokens: MAX_OUTPUT_TOKENS.transcriber,
  fake: fakeTranscribeChunk,
})
