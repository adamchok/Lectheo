import { expect, test } from '@playwright/test'

/* Security headers (next.config.ts) on pages and API routes alike. */
for (const path of ['/', '/api/v1/health']) {
  test(`security headers on ${path}`, async ({ request }) => {
    const res = await request.get(path)
    const headers = res.headers()
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    const reportOnly = headers['content-security-policy-report-only']
    expect(reportOnly).toContain("default-src 'self'")
    // Watch mode's YouTube player must stay allowed once the policy is enforced.
    expect(reportOnly).toMatch(/script-src [^;]*https:\/\/www\.youtube\.com/)
    expect(reportOnly).toMatch(/frame-src [^;]*https:\/\/www\.youtube-nocookie\.com/)
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['permissions-policy']).toContain('microphone=(self)')
  })
}
