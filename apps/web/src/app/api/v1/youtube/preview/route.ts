import { YoutubePreviewQuery, YoutubePreviewResponse } from '@lectheo/contracts'
import { route } from '@/server/http'
import { previewVideo } from '@/server/youtube'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/youtube/preview?url= (F10.2–F10.3) → the video card and the verdict for this
 * account · 422 not a YouTube link · 429 rate_limited. Data API only; no AI spend.
 */
export const GET = route(
  { auth: 'required', query: YoutubePreviewQuery, response: YoutubePreviewResponse },
  async ({ actor, query }) => previewVideo(actor, query.url),
)
