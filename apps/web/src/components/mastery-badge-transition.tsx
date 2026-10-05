'use client'

import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { MasteryBadge, type MasteryBadgeProps } from '@/components/mastery-badge'
import { MotionProvider } from '@/components/motion-provider'
import { duration, ease } from '@/lib/motion'
import { cn } from '@/lib/utils'

/**
 * Signature moment (Design System §3 Motion): when a concept's mastery changes, the badge
 * cross-fades to the new state over `duration-emphasis` (exit 40 %, enter 60 %). Use it only where
 * the state can change in place (node panel, result panels); everywhere else render `MasteryBadge`,
 * which imports no Motion code. The first render is static (`initial={false}`).
 */
export function MasteryBadgeTransition({ className, ...props }: MasteryBadgeProps) {
  return (
    <MotionProvider>
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={`${props.state}:${props.confidentMistake ?? false}`}
          className={cn('inline-flex shrink-0', className)}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: { duration: duration.emphasis * 0.6, ease: ease.out },
          }}
          exit={{ opacity: 0, transition: { duration: duration.emphasis * 0.4, ease: ease.in } }}
        >
          <MasteryBadge {...props} />
        </m.span>
      </AnimatePresence>
    </MotionProvider>
  )
}
