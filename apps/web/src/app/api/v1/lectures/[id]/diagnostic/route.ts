import { StartDiagnosticResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { startDiagnostic } from '@/server/diagnostic/start'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** POST /api/v1/lectures/{id}/diagnostic (F3.1): the active session, or a new plan. Stems only. */
export const POST = route(
  { auth: 'required', params: z.object({ id: z.string() }), response: StartDiagnosticResponse },
  async ({ actor, params }) => startDiagnostic(actor, params.id),
)
