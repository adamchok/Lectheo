import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@lectheo/contracts', '@lectheo/db', '@lectheo/domain', '@lectheo/ai'],
  typedRoutes: true,
}

export default nextConfig
