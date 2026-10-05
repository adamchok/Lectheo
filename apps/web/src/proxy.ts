import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/*
 * Next 16 proxy (replaces middleware.ts): refreshes the Supabase session cookie on every matched
 * request (standard @supabase/ssr pattern), sends signed-out visitors on app pages back to `/` and
 * signed-in visitors on `/` to the dashboard.
 * APIs are never redirected: their handlers answer 401 with the error envelope.
 */

const APP_PAGE_PREFIXES = ['/dashboard', '/courses', '/lectures', '/activities']

const isAppPage = (pathname: string): boolean =>
  APP_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

/** Signed-out visitors on app pages go to `/`; signed-in visitors on `/` go home (F0.2). */
function redirectTarget(signedIn: boolean, pathname: string): string | null {
  if (signedIn) return pathname === '/' ? '/dashboard' : null
  return isAppPage(pathname) ? '/' : null
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return NextResponse.next({ request }) // Supabase not configured (e.g. CI build)

  let response = NextResponse.next({ request })
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v)
      },
    },
  })

  // Don't put code between createServerClient and getClaims(): it refreshes the session.
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)

  const target = redirectTarget(signedIn, request.nextUrl.pathname)
  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url))
    // Keep any cookie changes (e.g. a cleared expired session).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }
  return response
}

export const config = {
  matcher: [
    // .well-known/workflow: Vercel Workflows' queue routes must bypass the session proxy
    // (workflow docs: proxied flow requests fail with "Queue operation failed").
    '/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|vtt|mp3)$).*)',
  ],
}
