import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/*
 * Next 16 proxy (replaces middleware.ts): refreshes the Supabase session cookie on every matched
 * request (standard @supabase/ssr pattern) and sends signed-out visitors on app pages back to `/`.
 * APIs are never redirected: their handlers answer 401 with the error envelope.
 */

const APP_PAGE_PREFIXES = ['/dashboard', '/courses', '/lectures', '/activities']

const isAppPage = (pathname: string): boolean =>
  APP_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))

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

  if (!signedIn && isAppPage(request.nextUrl.pathname)) {
    const redirect = NextResponse.redirect(new URL('/', request.url))
    // Keep any cookie changes (e.g. a cleared expired session).
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }
  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest|vtt|mp3)$).*)',
  ],
}
