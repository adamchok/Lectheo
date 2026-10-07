'use client'

import type { SourceRef as SourceRefData } from '@lectheo/contracts'
import { Play } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { formatTimestamp } from '@/client/format'
import { cn } from '@/lib/utils'
import { usePlayer } from './player-context'

export interface SourceRefProps {
  source: SourceRefData
  /** Overrides the PlayerContext seek (e.g. a local preview player). */
  onSeek?: (ms: number) => void
  /** Hide the excerpt and show only "▶ 12:41". */
  compact?: boolean
  /** Muted mono-sm time (the Study brief's right-aligned key point times, F9.12). */
  quiet?: boolean
  className?: string
}

const baseClass =
  'group inline-flex max-w-full items-baseline gap-1.5 rounded-md px-1.5 py-0.5 -mx-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:bg-accent'

/**
 * Grounding link "▶ 12:41 · excerpt" (Architecture §7). Seeks the player when one is
 * registered; otherwise opens the transcript panel, falling back to the lecture page.
 */
export function SourceRef({
  source,
  onSeek,
  compact = false,
  quiet = false,
  className,
}: SourceRefProps) {
  const player = usePlayer()
  const seek = onSeek ?? player.seek
  // WCAG 2.5.3: the accessible name contains the visible "12:41" (no aria-label override).
  const verb = seek ? 'Play from ' : 'Open transcript at '

  const content = (
    <>
      <Play
        aria-hidden
        className={cn(
          'size-3.5 shrink-0 translate-y-px fill-current',
          quiet ? 'text-muted-foreground group-hover:text-foreground' : 'text-primary',
        )}
      />
      <span className="sr-only">{verb}</span>
      <span
        className={cn(
          'tabular-nums',
          quiet
            ? 'text-mono-sm text-muted-foreground group-hover:text-foreground'
            : 'text-primary font-mono text-[0.8125rem] font-medium',
        )}
      >
        {formatTimestamp(source.startMs)}
      </span>
      {!compact && source.excerpt && (
        <>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground group-hover:text-foreground line-clamp-1 italic">
            “{source.excerpt}”
          </span>
        </>
      )}
    </>
  )

  if (seek) {
    return (
      <button
        type="button"
        className={cn(baseClass, className)}
        onClick={() => seek(source.startMs)}
      >
        {content}
      </button>
    )
  }

  if (player.openTranscript) {
    const open = player.openTranscript
    return (
      <button type="button" className={cn(baseClass, className)} onClick={() => open(source)}>
        {content}
      </button>
    )
  }

  const href = `/lectures/${source.lectureId}?t=${source.startMs}#transcript` as Route
  return (
    <Link href={href} className={cn(baseClass, className)}>
      {content}
    </Link>
  )
}
