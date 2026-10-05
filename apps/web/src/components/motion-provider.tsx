'use client'

import { LazyMotion, MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'

const loadFeatures = () => import('@/lib/motion-features').then((mod) => mod.default)

/**
 * Motion setup (Design System §3 Motion): `domAnimation` loads asynchronously, `strict` rejects the
 * heavy `motion.*` components (use `m.*`), and every animation follows the OS reduced-motion setting.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
