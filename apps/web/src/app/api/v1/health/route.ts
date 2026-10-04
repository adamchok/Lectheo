import { HealthResponse } from '@lectheo/contracts'
import { sql } from '@lectheo/db'
import { appDb } from '@/server/db'
import { serverEnv } from '@/server/env'
import { route } from '@/server/http'
import { readAppFlags } from '@/server/quota'

export const dynamic = 'force-dynamic'

/** GET /api/v1/health (public). Hit by the daily cron and uptime checks. */
export const GET = route({ auth: 'public', response: HealthResponse }, async () => {
  const version = serverEnv().VERCEL_GIT_COMMIT_SHA ?? 'dev'
  try {
    const db = appDb()
    await db.execute(sql`select 1`)
    const flags = await readAppFlags(db)
    return { ok: true, db: 'ok' as const, ...flags, version }
  } catch {
    return { ok: false, db: 'error' as const, aiPaused: false, intakePaused: false, version }
  }
})
