import { CreateActivityRequest, CreateActivityResponse } from '@lectheo/contracts'
import { createActivity } from '@/server/activities/service'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'
/** On-demand item generation may block ≈ 15–25 s (ADR-007). */
export const maxDuration = 60

/** POST /api/v1/activities → 201 (idempotent on the client-generated id). */
export const POST = route(
  { auth: 'required', body: CreateActivityRequest, response: CreateActivityResponse, status: 201 },
  async ({ actor, body }) => createActivity(actor, body),
)
