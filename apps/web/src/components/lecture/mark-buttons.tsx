'use client'

import type { MarkerKind } from '@lectheo/contracts'
import { Flag, Star } from 'lucide-react'
import { useId } from 'react'
import { findMark, useMarkers, useToggleMark, type MarkTarget } from '@/client/study'
import { errorMessage } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/* I'm lost / Important on a concept (F9.4) or a chapter (F11.4): toggles in marker colours. */

const KINDS: readonly { kind: MarkerKind; icon: typeof Flag; label: string; short: string }[] = [
  { kind: 'lost', icon: Flag, label: "I'm lost here", short: "I'm lost" },
  { kind: 'important', icon: Star, label: 'Important', short: 'Important' },
]

const PRESSED: Readonly<Record<MarkerKind, string>> = {
  lost: 'bg-marker-lost-bg text-marker-lost hover:bg-marker-lost-bg hover:text-marker-lost',
  important:
    'bg-marker-important-bg text-marker-important hover:bg-marker-important-bg hover:text-marker-important',
}

export interface MarkButtonsProps {
  lectureId: string
  courseId: string
  target: MarkTarget
  /** What is marked, for the icon-only buttons' names ("I'm lost: Hash tables"). */
  name: string
  /** Quiet icon buttons with tooltips (chapter rows) instead of labelled ghost buttons (Study). */
  iconOnly?: boolean
}

export function MarkButtons({
  lectureId,
  courseId,
  target,
  name,
  iconOnly = false,
}: MarkButtonsProps) {
  const markers = useMarkers(lectureId)
  const errorId = useId()
  const toggle = useToggleMark(lectureId, courseId)
  return (
    <div className="flex flex-wrap items-center gap-1">
      {KINDS.map(({ kind, icon: Icon, label, short }) => {
        const mark = findMark(markers.data, kind, target)
        const pressed = Boolean(mark)
        const button = (
          <Button
            variant="ghost"
            size={iconOnly ? 'icon' : 'sm'}
            aria-pressed={pressed}
            aria-label={iconOnly ? `${short}: ${name}` : undefined}
            disabled={!markers.data}
            aria-describedby={markers.isError ? errorId : undefined}
            onClick={() => toggle.toggle(kind, target, mark)}
            className={cn(iconOnly && 'size-8', pressed && PRESSED[kind])}
          >
            <Icon aria-hidden className={cn(pressed && 'fill-current')} />
            {!iconOnly && (
              <>
                {label}
                <span className="sr-only">: {name}</span>
              </>
            )}
          </Button>
        )
        return iconOnly ? (
          <Tooltip key={kind}>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent>{short}</TooltipContent>
          </Tooltip>
        ) : (
          <span key={kind}>{button}</span>
        )
      })}
      {markers.isError && (
        <p id={errorId} role="alert" className="text-caption text-destructive basis-full">
          Couldn&apos;t load your marks.{' '}
          <button type="button" className="underline" onClick={() => markers.refetch()}>
            Retry
          </button>
        </p>
      )}
      {toggle.isError && (
        <p role="alert" className="text-caption text-destructive basis-full">
          Couldn&apos;t save that mark. {errorMessage(toggle.error)}
        </p>
      )}
    </div>
  )
}
