import { AnswerRequest, AnswerResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { answerItem } from '@/server/diagnostic/answer'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** POST /api/v1/diagnostic/{sid}/items/{itemId}/answer (F3.4, F3.5): graded once, in code. */
export const POST = route(
  {
    auth: 'required',
    params: z.object({ sid: z.string(), itemId: z.string() }),
    body: AnswerRequest,
    response: AnswerResponse,
  },
  async ({ actor, params, body }) => answerItem(actor, params.sid, params.itemId, body.optionId),
)
