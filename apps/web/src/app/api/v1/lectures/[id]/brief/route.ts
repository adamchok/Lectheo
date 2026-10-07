import { BriefResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { getBrief } from '@/server/lectures/brief'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** GET /api/v1/lectures/{id}/brief → the Study brief (F9), from map_ready on; no AI calls. */
export const GET = route(
  { auth: 'required', params: Params, response: BriefResponse },
  async ({ actor, params }) => getBrief(actor, params.id),
)
