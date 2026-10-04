import { z } from 'zod'
import { requireEnv } from './env'
import { ApiError } from './errors'

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
const TIMEOUT_MS = 5_000

const SiteverifyResponse = z.object({
  success: z.boolean(),
  'error-codes': z.array(z.string()).optional(),
})

/**
 * Verifies a Turnstile token server-side. Throws 400 `validation_failed` for a bad token and
 * 503 `upstream_unavailable` when Cloudflare can't be reached in time.
 * Cloudflare's test secret (1x000…AA) accepts any token, so local dev and e2e pass.
 */
export async function verifyTurnstile(token: string, remoteIp?: string | null): Promise<void> {
  const form = new URLSearchParams({ secret: requireEnv('TURNSTILE_SECRET_KEY'), response: token })
  if (remoteIp) form.set('remoteip', remoteIp)

  let payload: unknown
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`siteverify HTTP ${res.status}`)
    payload = await res.json()
  } catch (err) {
    throw new ApiError('upstream_unavailable', 'Bot check is unavailable. Please try again.', {
      service: 'turnstile',
      reason: err instanceof Error ? err.name : 'unknown',
    })
  }

  const parsed = SiteverifyResponse.safeParse(payload)
  if (!parsed.success || !parsed.data.success) {
    throw new ApiError('validation_failed', 'The bot check failed. Please try again.', {
      errorCodes: parsed.success ? (parsed.data['error-codes'] ?? []) : [],
    })
  }
}

/** First hop of x-forwarded-for (set by Vercel). */
export const clientIp = (headers: Headers): string | null =>
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
