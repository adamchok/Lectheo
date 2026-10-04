import { ExplanationResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { showExplanation } from '@/server/activities/service'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** POST /api/v1/activities/{id}/explanation ("Show me"; marks later tries assisted). */
export const POST = route(
  { auth: 'required', params: z.object({ id: z.string() }), response: ExplanationResponse },
  async ({ actor, params }) => {
    const { explanation, sources } = await showExplanation(actor, params.id)
    return { explanation, sources: [...sources] }
  },
)
