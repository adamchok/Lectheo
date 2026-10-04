import { RedirectResponse, SampleSessionRequest } from '@lectheo/contracts'
import { getActor } from '@/server/auth'
import { appDb } from '@/server/db'
import { ApiError } from '@/server/errors'
import { route } from '@/server/http'
import { createSampleAccount } from '@/server/sample'
import { createSupabaseServerClient, supabaseAdmin } from '@/server/supabase'
import { clientIp, verifyTurnstile } from '@/server/turnstile'

export const dynamic = 'force-dynamic'

const DASHBOARD = { redirect: '/dashboard' }
const HTTP_TOO_MANY_REQUESTS = 429

/**
 * POST /api/v1/session/sample (public). Only ever called from the button click, never on page
 * load, so bots and link previews don't create users. Turnstile → anonymous sign-in (sets the
 * cookie) → profile + clone_sample in one transaction.
 */
export const POST = route(
  { auth: 'public', body: SampleSessionRequest, response: RedirectResponse },
  async ({ req, body }) => {
    // Already signed in (double click, back button): don't mint another user.
    if (await getActor()) return DASHBOARD

    await verifyTurnstile(body.turnstileToken, clientIp(req.headers))

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.signInAnonymously()
    if (error || !data.user) {
      if (error?.status === HTTP_TOO_MANY_REQUESTS) throw new ApiError('rate_limited')
      throw new ApiError('upstream_unavailable', "Couldn't start a sample account. Try again.")
    }

    const userId = data.user.id
    try {
      await createSampleAccount(appDb(), userId)
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
