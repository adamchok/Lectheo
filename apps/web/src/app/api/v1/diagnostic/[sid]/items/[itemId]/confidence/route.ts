import { ConfidenceRequest, ConfidenceResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { recordConfidence } from '@/server/diagnostic/session'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** POST /api/v1/diagnostic/{sid}/items/{itemId}/confidence (F3.3): the only endpoint with options. */
export const POST = route(
  {
    auth: 'required',
    params: z.object({ sid: z.string(), itemId: z.string() }),
    body: ConfidenceRequest,
    response: ConfidenceResponse,
  },
  async ({ actor, params, body }) => recordConfidence(actor, params.sid, params.itemId, body.level),
)
