/**
 * Absolute origin for metadata, robots and the sitemap: Vercel's production domain
 * (`VERCEL_PROJECT_PRODUCTION_URL`, no protocol), else the local server.
 */
export function siteUrl(): URL {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
  return new URL(host ? `https://${host}` : `http://localhost:${process.env.PORT ?? 3000}`)
}

/**
 * Light-theme tokens (Design System §2) as literals, for images drawn by next/og, which can't
 * read CSS custom properties. Keep in step with globals.css.
 */
export const BRAND = {
  background: '#fbfaf7',
  foreground: '#1c1d22',
  mutedForeground: '#5d5f68',
  primary: '#2b4acb',
  border: '#e4e1da',
} as const
