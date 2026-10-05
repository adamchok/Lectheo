import type { MasteryState } from '@lectheo/contracts'
import { cn } from '@/lib/utils'
import { pluralize } from '@/client/format'
import { MASTERY_META, MASTERY_ORDER } from './mastery-meta'

export type MasteryCounts = Readonly<Record<MasteryState, number>>

export interface MasteryBarProps {
  counts: MasteryCounts
  /** Show the icon + label + count legend under the bar. */
  showLegend?: boolean
  className?: string
}

export function describeMastery(counts: MasteryCounts): string {
  const total = MASTERY_ORDER.reduce((sum, state) => sum + counts[state], 0)
  if (total === 0) return 'No concepts yet'
  const parts = MASTERY_ORDER.filter((s) => counts[s] > 0).map(
    (s) => `${counts[s]} ${MASTERY_META[s].label.toLowerCase()}`,
  )
  return `${pluralize(total, 'concept')}: ${parts.join(', ')}`
}

/** Segmented green → amber → red → gray bar with an accessible text equivalent. */
export function MasteryBar({ counts, showLegend = true, className }: MasteryBarProps) {
  const total = MASTERY_ORDER.reduce((sum, state) => sum + counts[state], 0)
  const description = describeMastery(counts)

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="img"
        aria-label={description}
        className="bg-muted flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
      >
        {total > 0 &&
          MASTERY_ORDER.filter((s) => counts[s] > 0).map((state) => (
            <span
              key={state}
              className={cn('h-full first:rounded-l-full last:rounded-r-full', MASTERY_META[state].solidClass)}
              style={{ width: `${(counts[state] / total) * 100}%` }}
            />
          ))}
      </div>
      {showLegend && (
        <ul aria-hidden className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {total === 0 ? (
            <li>No concepts yet</li>
          ) : (
            MASTERY_ORDER.filter((s) => counts[s] > 0).map((state) => {
              const { icon: Icon, label, textClass } = MASTERY_META[state]
              return (
                <li key={state} className="inline-flex items-center gap-1">
                  <Icon className={cn('size-3.5', textClass)} />
                  <span className="text-foreground font-medium tabular-nums">{counts[state]}</span>
                  <span>{label}</span>
                </li>
              )
            })
          )}
        </ul>
      )}
    </div>
  )
}
