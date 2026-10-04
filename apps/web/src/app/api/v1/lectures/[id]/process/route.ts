import { ProcessQuery, ProcessResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { claimLecture } from '@/server/pipeline/claim'
import { startProcessing } from '@/server/pipeline/start'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/**
 * POST /api/v1/lectures/{id}/process[?from=step] → 202 { status: 'processing' }.
 * 409 already_processing · 429 quota_exceeded (re-runs) · 503 intake_paused.
 */
export const POST = route(
  { auth: 'required', params: Params, query: ProcessQuery, response: ProcessResponse, status: 202 },
  async ({ actor, params, query }) => {
    await claimLecture(actor, params.id, query.from)
    await startProcessing(params.id)
    return { status: 'processing' as const }
  },
)
