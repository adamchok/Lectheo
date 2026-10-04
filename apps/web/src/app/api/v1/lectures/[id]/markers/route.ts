import { ListMarkersResponse, PostMarkersRequest, PostMarkersResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { listMarkers, postMarkers } from '@/server/lectures/markers'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** GET /api/v1/lectures/{id}/markers → the caller's live markers with linked concepts. */
export const GET = route(
  { auth: 'required', params: Params, response: ListMarkersResponse },
  async ({ actor, params }) => listMarkers(actor, params.id),
)

/** POST /api/v1/lectures/{id}/markers `{ markers[≤200] }` → `{ accepted, duplicates }` (safe to resend). */
export const POST = route(
  { auth: 'required', params: Params, body: PostMarkersRequest, response: PostMarkersResponse },
  async ({ actor, params, body }) => postMarkers(actor, params.id, body.markers),
)
