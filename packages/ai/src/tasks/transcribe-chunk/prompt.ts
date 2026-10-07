import type { GoogleRequest } from '../../google-direct'
import { MAX_OUTPUT_TOKENS } from '../../models'
import type { PromptSpec } from '../../run-task'
import { CUES_JSON_SCHEMA, type TranscribeChunkInput } from './schema'

/** @2: clean verbatim (F10.9: the scorer's references leave fillers out). Part of the cache key. */
export const PROMPT_VERSION = 'transcribe-chunk@2'
/** Caps thinking tokens (billed as output) per clip. */
const THINKING_BUDGET = 1_024

/** "H:MM:SS". */
export function stamp(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${mm}:${ss}`
}

export const youtubeWatchUrl = (videoId: string): string =>
  `https://www.youtube.com/watch?v=${videoId}`

/**
 * The spike's prompt (docs/spikes/youtube-transcripts.md §1), asking for clean verbatim instead of
 * verbatim (F10.9 decision, 7 Oct 2026). No untrusted text.
 */
export function buildPrompt(input: TranscribeChunkInput): PromptSpec {
  return {
    system: '',
    prompt:
      `Transcribe the speech in this video between ${stamp(input.startMs)} and ` +
      `${stamp(input.endMs)} in English, as clean verbatim: keep every content word in the ` +
      'order it is spoken, but leave out filler words (uh, um, "right" and "ok" used as ' +
      'fillers, "you know"), false starts and stutters. Return cues of one or two sentences ' +
      'each (about 5–15 seconds). start/end are the timestamps of the video timeline where the ' +
      'cue is spoken, as H:MM:SS. Cover the whole range without gaps; skip nothing; do not ' +
      'summarise. If there is no speech, return an empty cues array.',
  }
}

/** The video clip as `fileData` + part-level `videoMetadata` offsets, low media resolution. */
export function googleRequest(input: TranscribeChunkInput): GoogleRequest {
  return {
    parts: [
      {
        fileData: { fileUri: youtubeWatchUrl(input.videoId), mimeType: 'video/mp4' },
        videoMetadata: {
          startOffset: `${Math.floor(input.startMs / 1000)}s`,
          endOffset: `${Math.ceil(input.endMs / 1000)}s`,
        },
      },
      { text: buildPrompt(input).prompt },
    ],
    generationConfig: {
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      maxOutputTokens: MAX_OUTPUT_TOKENS.transcriber,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      responseMimeType: 'application/json',
      responseJsonSchema: CUES_JSON_SCHEMA,
    },
  }
}
