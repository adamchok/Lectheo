import { z } from 'zod'

/** One 2-minute clip of a public YouTube video, in video-timeline ms (F10.5). */
export const TranscribeChunkInput = z.object({
  videoId: z.string().regex(/^[\w-]{11}$/),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
})
export type TranscribeChunkInput = z.infer<typeof TranscribeChunkInput>

/** Cue times are "H:MM:SS" on the whole-video timeline (integer ms was clearly worse: spike). */
export const TranscribeChunkOutput = z.object({
  cues: z.array(z.object({ start: z.string(), end: z.string(), text: z.string() })),
})
export type TranscribeChunkOutput = z.infer<typeof TranscribeChunkOutput>

/** The spike's `responseJsonSchema` (Google structured output). */
export const CUES_JSON_SCHEMA = {
  type: 'object',
  required: ['cues'],
  properties: {
    cues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['start', 'end', 'text'],
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
} as const
