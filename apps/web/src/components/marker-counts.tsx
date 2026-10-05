import { Flag, Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MarkerCountsProps {
  lost: number
  important: number
  /** Render zero counts too (default hides them). */
  showZero?: boolean
  className?: string
}

/** Lost = flagged, important = starred (F2.3). Icon + count + label. */
export function MarkerCounts({ lost, important, showZero = false, className }: MarkerCountsProps) {
  const showLost = showZero || lost > 0
  const showImportant = showZero || important > 0
  if (!showLost && !showImportant) return null
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5 text-xs', className)}>
      {showLost && (
        <span className="bg-marker-lost-bg text-marker-lost inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
          <Flag aria-hidden className="size-3.5 fill-current" />
          <span className="tabular-nums">{lost}</span> lost
        </span>
      )}
      {showImportant && (
        <span className="bg-marker-important-bg text-marker-important inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium">
          <Star aria-hidden className="size-3.5 fill-current" />
          <span className="tabular-nums">{important}</span> important
        </span>
      )}
    </span>
  )
}
