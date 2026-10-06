import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site'

/** Public pages only; the app and the API sit behind sign-in. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/dashboard', '/courses/', '/lectures/', '/activities/'],
    },
    sitemap: new URL('/sitemap.xml', siteUrl()).href,
  }
}
