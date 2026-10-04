import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireEnv, supabaseUrl } from './env'

/*
 * Supabase is used for Auth and Storage only (ADR-003). Data goes through Drizzle.
 */

/** Per-request client bound to the session cookies (Auth only). */
export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl(), requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components can't set cookies. Safe to ignore: proxy.ts refreshes the session.
        }
      },
    },
  })
}

let admin: SupabaseClient | undefined

/** Privileged client (secret key) for Storage and Auth admin. Never expose to the browser. */
export function supabaseAdmin(): SupabaseClient {
  admin ??= createClient(supabaseUrl(), requireEnv('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return admin
}
