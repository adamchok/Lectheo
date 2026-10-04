import { ApiError } from '@/server/errors'
import { route } from '@/server/http'
import { createSupabaseServerClient } from '@/server/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/session/sign-out → 204. Public on purpose: signing out with an expired session
 * should still clear the cookies instead of answering 401.
 */
export const POST = route({ auth: 'public', status: 204 }, async () => {
  const supabase = await createSupabaseServerClient()
  // scope 'local': end this browser's session only.
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error && error.status !== 401 && error.status !== 403) {
    throw new ApiError('upstream_unavailable', "Couldn't sign out. Please try again.")
  }
})
