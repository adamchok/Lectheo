import { SubmitResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { submitActivity } from '@/server/activities/submit'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'
/** The judge call can take several seconds. */
export const maxDuration = 60

/** POST /api/v1/activities/{id}/submit. The body is validated per activity type in the service. */
export const POST = route(
  {
    auth: 'required',
    params: z.object({ id: z.string() }),
    body: z.looseObject({}),
    response: SubmitResponse,
  },
  async ({ actor, params, body }) => submitActivity(actor, params.id, body),
)
