import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { appDb } from '@/server/db'
import { requireEnv } from '@/server/env'
import { ApiError } from '@/server/errors'
import { route } from '@/server/http'
import { purgeSampleAccounts } from '@/server/sample'
import { supabaseAdmin } from '@/server/supabase'

export const dynamic = 'force-dynamic'

const CronResponse = z.object({ purged: z.number().int(), authUsersDeleted: z.number().int() })

/**
 * GET /api/cron/daily (Vercel cron, see vercel.json). Requires `Authorization: Bearer CRON_SECRET`.
 * Purges sample accounts older than 24 h (DB rows, then their auth users, best effort). The query
 * also keeps the free Supabase project from pausing.
 */
export const GET = route({ auth: 'public', response: CronResponse }, async ({ req }) => {
  if (!isCronRequest(req.headers.get('authorization'))) throw new ApiError('unauthenticated')

  const ids = await purgeSampleAccounts(appDb())
  const results = await Promise.allSettled(
    ids.map((id) => supabaseAdmin().auth.admin.deleteUser(id)),
  )
  const authUsersDeleted = results.filter((r) => r.status === 'fulfilled' && !r.value.error).length
  return { purged: ids.length, authUsersDeleted }
})

function isCronRequest(header: string | null): boolean {
  const expected = Buffer.from(`Bearer ${requireEnv('CRON_SECRET')}`)
  const actual = Buffer.from(header ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
