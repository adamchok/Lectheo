import { NextResponse, type NextRequest } from 'next/server'
import { displayName, ensureProfile } from '@/server/auth'
import { appDb } from '@/server/db'
import { createSupabaseServerClient } from '@/server/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /auth/callback — Google OAuth return (outside /api). Exchanges the PKCE code for a session
 * cookie, creates the Google profile, and lands on the dashboard. Any failure → `/?error=auth`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get('code')
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url))
  if (!code) return to('/?error=auth')

  try {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.user) return to('/?error=auth')
    const { id, user_metadata: meta, email } = data.user
    await ensureProfile(appDb(), id, 'google', displayName(meta, email))
    return to('/dashboard')
  } catch (err) {
    console.error(JSON.stringify({ route: 'GET /auth/callback', error: String(err) }))
    return to('/?error=auth')
  }
}
