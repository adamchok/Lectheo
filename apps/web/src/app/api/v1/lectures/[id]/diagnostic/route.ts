import { StartDiagnosticRequest, StartDiagnosticResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { startDiagnostic } from '@/server/diagnostic/start'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/lectures/{id}/diagnostic (F3.1, F3.10): the active session, or a new plan for
 * `round` (default core). Stems only.
 */
export const POST = route(
  {
    auth: 'required',
    params: z.object({ id: z.string() }),
    body: StartDiagnosticRequest,
    response: StartDiagnosticResponse,
  },
  async ({ actor, params, body }) => startDiagnostic(actor, params.id, undefined, body.round),
)
