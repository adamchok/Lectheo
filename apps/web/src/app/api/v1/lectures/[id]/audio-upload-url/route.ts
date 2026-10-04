import { AudioUploadUrlRequest, UploadUrlResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { createAudioUpload } from '@/server/lectures/audio-upload'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** POST /api/v1/lectures/{id}/audio-upload-url → signed Storage upload URL (per-tier size). */
export const POST = route(
  { auth: 'required', params: Params, body: AudioUploadUrlRequest, response: UploadUrlResponse },
  async ({ actor, params, body }) => createAudioUpload(actor, params.id, body),
)
