import { DiagnosticSessionResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { getSession } from '@/server/diagnostic/session'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** GET /api/v1/diagnostic/{sid}: resume state. */
export const GET = route(
  { auth: 'required', params: z.object({ sid: z.string() }), response: DiagnosticSessionResponse },
  async ({ actor, params }) => getSession(actor, params.sid),
)
