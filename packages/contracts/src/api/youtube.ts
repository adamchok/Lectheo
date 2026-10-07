import { z } from 'zod'
import { Ms } from '../common'

/* GET /youtube/preview (F10.2–F10.3): the link check before any AI spend. */

/** Why a video can't be added, in the order the server checks them (F10.3). */
export const YOUTUBE_REFUSALS = [
  'not_found',
  'private',
  'live',
  'embed_disabled',
  'age_restricted',
  'too_short',
  'too_long',
  'not_english',
] as const
export const YoutubeRefusal = z.enum(YOUTUBE_REFUSALS)
export type YoutubeRefusal = z.infer<typeof YoutubeRefusal>

export const YoutubePreviewQuery = z.object({ url: z.string().trim().min(1).max(500) })

/** `title`, `channel` and `thumbnailUrl` are null only when the video wasn't found. */
export const YoutubePreviewResponse = z.object({
  videoId: z.string(),
  title: z.string().nullable(),
  channel: z.string().nullable(),
  durationMs: Ms.nullable(),
  thumbnailUrl: z.string().nullable(),
  ok: z.boolean(),
  reason: YoutubeRefusal.optional(),
})
export type YoutubePreviewResponse = z.infer<typeof YoutubePreviewResponse>

/** Shortest video worth a concept map (F10.3). */
export const YOUTUBE_MIN_DURATION_MS = 5 * 60_000

/** The refusal in plain words. `maxMinutes` is the account's length limit. */
export function youtubeRefusalMessage(reason: YoutubeRefusal, maxMinutes: number): string {
  const limit = maxMinutes >= 60 ? `${maxMinutes / 60} hours` : `${maxMinutes} minutes`
  switch (reason) {
    case 'not_found':
      return 'We couldn’t find this video. Check the link: private and deleted videos can’t be added.'
    case 'private':
      return 'This video is private. Only public or unlisted videos can be added.'
    case 'live':
      return 'This is a live or upcoming stream. Add it once the recording is available.'
    case 'embed_disabled':
      return 'This video’s owner doesn’t allow it to play on other sites, so it can’t be added.'
    case 'age_restricted':
      return 'This video is age-restricted, so it can’t play here. Try another video.'
    case 'too_short':
      return 'This video is shorter than 5 minutes. Add a full lecture instead.'
    case 'too_long':
      return `This video is longer than your limit of ${limit}.`
    case 'not_english':
      return 'This video isn’t in English. Lectheo works with English lectures for now.'
  }
}
