import { z } from 'zod'
import { route } from '@/server/http'
import { deleteMarker } from '@/server/lectures/markers'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string(), markerId: z.string() })

/** DELETE /api/v1/lectures/{id}/markers/{markerId} → 204 (undo, soft delete). */
export const DELETE = route(
  { auth: 'required', params: Params, status: 204 },
  async ({ actor, params }) => deleteMarker(actor, params.id, params.markerId),
)
