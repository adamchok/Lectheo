'use client'

import { createBrowserClient } from '@supabase/ssr'

type BrowserClient = ReturnType<typeof createBrowserClient>

let client: BrowserClient | undefined

/**
 * Lazily created browser Supabase client. The browser only uses Supabase for Google OAuth
 * (Architecture §2: Data API is off). Returns `null` when env vars are missing so the build
 * and the sign-in page never crash without configuration.
 */
export function getSupabaseBrowserClient(): BrowserClient | null {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return null
  client = createBrowserClient(url, key)
  return client
}

/** Starts Google OAuth; Supabase redirects back to /auth/callback. */
export async function signInWithGoogle(): Promise<void> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error('Google sign-in is not configured.')
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  })
  if (error) throw error
}
