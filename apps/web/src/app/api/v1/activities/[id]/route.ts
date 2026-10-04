import { ActivityResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { getActivity } from '@/server/activities/service'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** GET /api/v1/activities/{id} (visible messages only). */
export const GET = route(
  { auth: 'required', params: z.object({ id: z.string() }), response: ActivityResponse },
  async ({ actor, params }) => getActivity(actor, params.id),
)
