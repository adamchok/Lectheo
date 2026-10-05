import { expect, test } from '@playwright/test'

/* Security headers (next.config.ts) on pages and API routes alike. */
for (const path of ['/', '/api/v1/health']) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path)
    const headers = res.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy-report-only']).toContain("default-src 'self'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('microphone=(self)')
  })
}
