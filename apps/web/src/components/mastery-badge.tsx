'use client'

import type { MasteryState } from '@lectheo/contracts'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
        className,
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

  if (!hasReasons) return badge

  return (
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
  )
}
