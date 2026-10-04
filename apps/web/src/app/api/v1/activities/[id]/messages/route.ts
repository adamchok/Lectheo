import { AuthorReplyResponse, PostMessageRequest } from '@lectheo/contracts'
import { z } from 'zod'
import { postMessage } from '@/server/activities/service'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/v1/activities/{id}/messages. spot_flaw → JSON { reply, turnsLeft } (leak-checked);
 * teach_back → UI message stream (the handler returns the Response).
 */
export const POST = route(
  {
    auth: 'required',
    params: z.object({ id: z.string() }),
    body: PostMessageRequest,
    response: AuthorReplyResponse,
  },
  async ({ actor, params, body }) => postMessage(actor, params.id, body.text),
)
