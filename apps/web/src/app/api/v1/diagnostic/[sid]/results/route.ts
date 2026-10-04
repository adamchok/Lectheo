import { DiagnosticResultsResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { getResults } from '@/server/diagnostic/results'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** GET /api/v1/diagnostic/{sid}/results (F3.6). */
export const GET = route(
  { auth: 'required', params: z.object({ sid: z.string() }), response: DiagnosticResultsResponse },
  async ({ actor, params }) => getResults(actor, params.sid),
)
