import { NextStepResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { getNextStep } from '@/server/courses/next'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** GET /api/v1/courses/{id}/next → the dashboard "Next step" card (recommender). */
export const GET = route(
  { auth: 'required', params: Params, response: NextStepResponse },
  async ({ actor, params }) => getNextStep(actor, params.id),
)
