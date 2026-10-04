import { TranscriptQuery, TranscriptResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { getTranscript } from '@/server/lectures/read'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** GET /api/v1/lectures/{id}/transcript?fromMs&toMs → segments (user edits applied). */
export const GET = route(
  { auth: 'required', params: Params, query: TranscriptQuery, response: TranscriptResponse },
  async ({ actor, params, query }) => getTranscript(actor, params.id, query),
)

// TODO(F1 import): POST /lectures/{id}/transcript (multipart .vtt/.srt/.txt/.docx or JSON
// `{ text }`, API Spec §5) is a later feature: parse, strip speakers, store segments, set
// hasTimestamps → 201 TranscriptUploadResponse.
