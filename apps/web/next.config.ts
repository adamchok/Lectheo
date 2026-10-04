import type { NextConfig } from 'next'
import { withWorkflow } from 'workflow/next'

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ['@lectheo/contracts', '@lectheo/db', '@lectheo/domain', '@lectheo/ai'],
  typedRoutes: true,
}

// Vercel Workflows: compiles 'use workflow' / 'use step' (ADR-002, server/pipeline/workflow.ts).
export default withWorkflow(nextConfig)
