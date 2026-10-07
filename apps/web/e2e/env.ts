import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url))
export const E2E_PORT = 3100
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`

/** Cloudflare's documented always-pass Turnstile test keys. */
const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'
const TURNSTILE_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA'

/**
 * E2E_OFFLINE=1: for sandboxes that can't reach Cloudflare. The server answers Turnstile siteverify
 * locally (offline/preload.mjs) and signInSample serves a stub widget. CI leaves it unset, so the
 * real Turnstile test widget stays covered there.
 */
export const E2E_OFFLINE = process.env.E2E_OFFLINE === '1'
// A file:// URL, quoted: a raw Windows path (D:\…) reads as a URL scheme to --import.
const OFFLINE_PRELOAD = new URL('./offline/preload.mjs', import.meta.url).href

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const CACHE_KEY = 'LECTHEO_E2E_ENV'

interface SupabaseStatus {
  API_URL: string
  DB_URL: string
  PUBLISHABLE_KEY: string
  SECRET_KEY: string
}

/** Refuses anything but a local database: global setup migrates and seeds it. */
export function assertLocalDatabase(url: string): void {
  const host = new URL(url).hostname
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`e2e refuses to run against a non-local database (host: ${host})`)
  }
}

function readSupabaseStatus(): SupabaseStatus {
  let out: string
  try {
    out = execSync('pnpm exec supabase status -o json', {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch {
    throw new Error('Local Supabase is not running. Start it with `npx supabase start`.')
  }
  return JSON.parse(out.slice(out.indexOf('{'))) as SupabaseStatus
}

export interface E2eEnv extends Record<string, string> {
  POSTGRES_URL: string
  POSTGRES_URL_NON_POOLING: string
}

/**
 * Env for the e2e web server and the test workers, built from the running local Supabase. Read
 * once by the runner and cached in process.env, which workers inherit.
 */
export function e2eEnv(): E2eEnv {
  const cached = process.env[CACHE_KEY]
  if (cached) return JSON.parse(cached) as E2eEnv

  const status = readSupabaseStatus()
  assertLocalDatabase(status.DB_URL)
  const env: E2eEnv = {
    POSTGRES_URL: status.DB_URL,
    POSTGRES_URL_NON_POOLING: status.DB_URL,
    SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: TURNSTILE_TEST_SITE_KEY,
    TURNSTILE_SECRET_KEY: TURNSTILE_TEST_SECRET_KEY,
    AI_FAKE: '1',
    // F10 is off by default; e2e covers it with the fake Data API and transcriber.
    FEATURE_YOUTUBE_LECTURES: '1',
    AI_GATEWAY_KEY_NAME: 'dev',
    CRON_SECRET: 'e2e-cron-secret',
    PORT: String(E2E_PORT),
    // Defence in depth: process env beats apps/web/.env.local, so real keys never load here.
    AI_GATEWAY_API_KEY: '',
    ASSEMBLYAI_API_KEY: '',
    VERCEL_OIDC_TOKEN: '',
    ...(E2E_OFFLINE && {
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import "${OFFLINE_PRELOAD}"`.trim(),
    }),
  }
  process.env[CACHE_KEY] = JSON.stringify(env)
  return env
}
