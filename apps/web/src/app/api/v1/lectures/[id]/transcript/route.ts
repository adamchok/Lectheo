import { TranscriptQuery, TranscriptResponse, TranscriptUploadResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { getTranscript } from '@/server/lectures/read'
import {
  readTranscriptRequest,
  takeTranscriptUpload,
  uploadTranscript,
} from '@/server/lectures/transcript-upload'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** GET /api/v1/lectures/{id}/transcript?fromMs&toMs → segments (user edits applied). */
export const GET = route(
  { auth: 'required', params: Params, query: TranscriptQuery, response: TranscriptResponse },
  async ({ actor, params, query }) => getTranscript(actor, params.id, query),
)

/**
 * POST /api/v1/lectures/{id}/transcript: multipart `file` (.vtt/.srt/.txt/Teams .docx ≤ 2 MB)
 * or JSON `{ text }` → 201 { segments, hasTimestamps, durationMs, truncated } · 422 unreadable
 * · 429 rate_limited. The body is read by the handler (multipart), so the route declares no body
 * schema; the rate limit is taken before the body is read.
 */
export const POST = route(
  { auth: 'required', params: Params, response: TranscriptUploadResponse, status: 201 },
  async ({ actor, params, req }) => {
    await takeTranscriptUpload(actor)
    return uploadTranscript(actor, params.id, await readTranscriptRequest(req))
  },
)
