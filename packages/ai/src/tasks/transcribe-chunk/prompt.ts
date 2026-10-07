import type { GoogleRequest } from '../../google-direct'
import { MAX_OUTPUT_TOKENS } from '../../models'
import type { PromptSpec } from '../../run-task'
import { CUES_JSON_SCHEMA, type TranscribeChunkInput } from './schema'

export const PROMPT_VERSION = 'transcribe-chunk@1'

/** "H:MM:SS". */
export function stamp(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${mm}:${ss}`
}

export const youtubeWatchUrl = (videoId: string): string =>
  `https://www.youtube.com/watch?v=${videoId}`

/** The spike's prompt, verbatim (docs/spikes/youtube-transcripts.md §1). No untrusted text. */
export function buildPrompt(input: TranscribeChunkInput): PromptSpec {
  return {
    system: '',
    prompt:
      `Transcribe the speech in this video between ${stamp(input.startMs)} and ` +
      `${stamp(input.endMs)}, verbatim, in English. Return cues of one or two sentences each ` +
      '(about 5–15 seconds). start/end are the timestamps of the video timeline where the cue ' +
      'is spoken, as H:MM:SS. Cover the whole range without gaps; skip nothing; do not ' +
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
      responseMimeType: 'application/json',
      responseJsonSchema: CUES_JSON_SCHEMA,
    },
  }
}
