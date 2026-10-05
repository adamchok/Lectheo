'use client'

import type { MasteryState } from '@lectheo/contracts'
import { AnimatePresence, m } from 'motion/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { duration, ease } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { MASTERY_META } from './mastery-meta'

export interface MasteryBadgeProps {
  state: MasteryState
  /** Why the concept is in this state (F6.1); shown in a tooltip. */
  reasons?: readonly string[]
  /** Unresolved confident mistake (F3.5) — adds a second label. */
  confidentMistake?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** Mastery state as icon + text label, never colour alone (F6.1). */
export function MasteryBadge({
  state,
  reasons,
  confidentMistake = false,
  size = 'md',
  className,
}: MasteryBadgeProps) {
  const meta = MASTERY_META[state]
  const Icon = meta.icon
  const hasReasons = Boolean(reasons && reasons.length > 0)

  const badge = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[0.8125rem]',
        meta.badgeClass,
        hasReasons && 'cursor-help',
      )}
      tabIndex={hasReasons ? 0 : undefined}
    >
      <Icon aria-hidden className={size === 'sm' ? 'size-3.5' : 'size-4'} />
      <span>{meta.label}</span>
      {confidentMistake && (
        <>
          <span aria-hidden className="opacity-50">
            ·
          </span>
          <span>Confident mistake</span>
        </>
      )}
    </span>
  )

  // Signature moment (Design System §3 Motion): a state change cross-fades over duration-emphasis.
  // `initial={false}` keeps the first render static.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={`${state}:${confidentMistake}`}
        className={cn('inline-flex shrink-0', className)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: duration.emphasis * 0.6, ease: ease.out } }}
        exit={{ opacity: 0, transition: { duration: duration.emphasis * 0.4, ease: ease.in } }}
      >
        {hasReasons ? (
          <Tooltip>
            <TooltipTrigger asChild>{badge}</TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <ul className="space-y-0.5">
                {reasons!.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        ) : (
          badge
        )}
      </m.span>
    </AnimatePresence>
  )
}
