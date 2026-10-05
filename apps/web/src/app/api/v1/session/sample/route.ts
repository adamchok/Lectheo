import { RedirectResponse, SampleSessionRequest } from '@lectheo/contracts'
import { after } from 'next/server'
import { getActor } from '@/server/auth'
import { appDb, type DbLike } from '@/server/db'
import { ApiError, safeErrorMessage } from '@/server/errors'
import { route } from '@/server/http'
import { pruneRateLimits, SAMPLE_SIGNIN_LIMIT, takeRateLimit } from '@/server/rate-limit'
import { createSampleAccount, purgeSampleAccounts } from '@/server/sample'
import { createSupabaseServerClient, supabaseAdmin } from '@/server/supabase'
import { clientIp, verifyTurnstile } from '@/server/turnstile'

export const dynamic = 'force-dynamic'

const DASHBOARD = { redirect: '/dashboard' }
const HTTP_TOO_MANY_REQUESTS = 429
const DAY_MS = 24 * 60 * 60_000
/** Next's own server fills x-forwarded-for with the socket address: loopback = local dev/e2e. */
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/

/**
 * F0.6: the daily cron alone lets a sample live ~48 h, so every sample sign-in also purges expired
 * ones (and stale rate-limit windows). Runs after the response; failures are only logged.
 */
async function purgeExpired(db: DbLike): Promise<void> {
  try {
    await pruneRateLimits(db, new Date(Date.now() - DAY_MS))
    const ids = await purgeSampleAccounts(db)
    if (ids.length === 0) return
    const admin = supabaseAdmin()
    await Promise.allSettled(ids.map((id) => admin.auth.admin.deleteUser(id)))
  } catch (err) {
    console.log(JSON.stringify({ event: 'sample_purge_failed', reason: safeErrorMessage(err) }))
  }
}

/**
 * POST /api/v1/session/sample (public). Only ever called from the button click, never on page
 * load, so bots and link previews don't create users. Turnstile → anonymous sign-in (sets the
 * cookie) → profile + clone_sample in one transaction. Per-IP limit first (Supabase's own
 * anonymous sign-in limit sees Vercel's egress IPs, so it is effectively global).
 */
export const POST = route(
  { auth: 'public', body: SampleSessionRequest, response: RedirectResponse },
  async ({ req, body }) => {
    // Already signed in (double click, back button): don't mint another user.
    if (await getActor()) return DASHBOARD

    const db = appDb()
    const ip = clientIp(req.headers)
    // No IP or loopback (local dev): no limit. x-forwarded-for is trustworthy only because Vercel
    // overwrites it.
    if (
      ip &&
      !LOOPBACK.test(ip) &&
      !(await takeRateLimit(db, `sample:${ip}`, SAMPLE_SIGNIN_LIMIT))
    ) {
      throw new ApiError('rate_limited')
    }
    await verifyTurnstile(body.turnstileToken, ip)
    // Only verified traffic schedules purge work.
    after(() => purgeExpired(db))

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      if (error?.status === HTTP_TOO_MANY_REQUESTS) throw new ApiError('rate_limited')
      throw new ApiError('upstream_unavailable', "Couldn't start a sample account. Try again.")
    }

    const userId = data.user.id
    try {
      await createSampleAccount(db, userId)
    } catch (err) {
      // Best effort: don't leave a signed-in user without a profile behind.
      await Promise.allSettled([
        supabase.auth.signOut(),
        supabaseAdmin().auth.admin.deleteUser(userId),
      ])
      throw err
    }
    return DASHBOARD
  },
)
