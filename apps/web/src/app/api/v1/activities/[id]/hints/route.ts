import { HintResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { takeHint } from '@/server/activities/service'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** POST /api/v1/activities/{id}/hints (2-step ladder; marks later tries assisted). */
export const POST = route(
  { auth: 'required', params: z.object({ id: z.string() }), response: HintResponse },
  async ({ actor, params }) => takeHint(actor, params.id),
)
