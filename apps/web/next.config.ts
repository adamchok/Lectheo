import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'

const isDev = process.env.NODE_ENV === 'development'
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const turnstile = 'https://challenges.cloudflare.com'
// Watch mode: IFrame API script from youtube.com; the player frames youtube-nocookie.com.
const youtube = 'https://www.youtube.com'
const youtubeFrame = 'https://www.youtube-nocookie.com'

/** Enforced: no framing, plugins or <base> hijack. Safe with Next's inline scripts. */
const CSP = "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"

/**
 * Full policy, report-only (Next's no-nonce recipe + Supabase, Turnstile and YouTube origins).
 * ponytail: report-only until it has run clean through the judge path; then promote to enforced.
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} ${turnstile} ${youtube}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${supabase} ${supabase.replace(/^http/, 'ws')}`,
  `media-src 'self' blob: ${supabase}`,
  `frame-src ${turnstile} ${youtubeFrame} ${youtube}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // The live recorder needs the microphone on our own origin only.
  { key: 'Permissions-Policy', value: 'microphone=(self), camera=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@lectheo/contracts', '@lectheo/db', '@lectheo/domain', '@lectheo/ai'],
  typedRoutes: true,
  // Tree-shake the `motion/react` barrel so pages only ship the pieces they import.
  experimental: { optimizePackageImports: ['motion'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

// Vercel Workflows: compiles 'use workflow' / 'use step' (ADR-002, server/pipeline/workflow.ts).
export default withWorkflow(nextConfig)
