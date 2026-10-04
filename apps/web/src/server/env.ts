import { z } from 'zod'

/*
 * Environment access is lazy: nothing is read at import time, so `next build` works without
 * secrets. Each value is validated on first use, with an error that names the missing variable.
 */

const optional = z.string().trim().min(1).optional()

const ServerEnv = z.object({
  POSTGRES_URL: optional,
  SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional,
  SUPABASE_SECRET_KEY: optional,
  TURNSTILE_SECRET_KEY: optional,
  AI_GATEWAY_API_KEY: optional,
  AI_FAKE: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  AI_PROD_BUDGET_USD: z.coerce.number().positive().default(25),
  ASSEMBLYAI_API_KEY: optional,
  CRON_SECRET: optional,
  VERCEL_GIT_COMMIT_SHA: optional,
})
export type ServerEnv = z.infer<typeof ServerEnv>

type OptionalKey = {
  [K in keyof ServerEnv]-?: undefined extends ServerEnv[K] ? K : never
}[keyof ServerEnv]

let cached: ServerEnv | undefined

/** Parsed server env. Optional values may be undefined; use requireEnv() for must-haves. */
export function serverEnv(): ServerEnv {
  if (cached) return cached
  // Empty values (`KEY=` in .env files) count as unset.
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''))
  const parsed = ServerEnv.safeParse(raw)
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment variables: ${fields}`)
  }
  cached = parsed.data
  return cached
}

/** A value that must be set for the calling feature to work. Throws a clear error otherwise. */
export function requireEnv<K extends OptionalKey & keyof ServerEnv>(
  key: K,
): NonNullable<ServerEnv[K]> {
  const value = serverEnv()[key]
  if (value === undefined) {
    throw new Error(`Missing environment variable ${key} (see .env.example)`)
  }
  return value as NonNullable<ServerEnv[K]>
}

export const isAiFake = (): boolean => serverEnv().AI_FAKE

/** Supabase URL for server code (the private one wins when both are set). */
export const supabaseUrl = (): string =>
  serverEnv().SUPABASE_URL ?? requireEnv('NEXT_PUBLIC_SUPABASE_URL')

/** Test hook: forget the parsed env so the next call re-reads process.env. */
export function resetEnvCache(): void {
  cached = undefined
}

/*
 * Public env (NEXT_PUBLIC_*). Next inlines these only when referenced literally, so each one is
 * read with its full name. Returns null when Supabase isn't configured (lets the proxy no-op).
 */
export function publicSupabaseEnv(): { url: string; publishableKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  return url && publishableKey ? { url, publishableKey } : null
}
