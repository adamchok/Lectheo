'use client'

import type { LectureResponse, MarkerKind } from '@lectheo/contracts'
import { ArrowRight, Check, Flag, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import type { RefObject } from 'react'
import { MARKER_SHORTCUTS } from '@/client/capture/use-marker-hotkeys'
import { BuildMapCta, MapBuildingNote } from '@/components/capture/build-map-cta'
import { KeyHint } from '@/components/key-hint'
import { MarkerCounts } from '@/components/marker-counts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export const MARKER_LABELS: Readonly<Record<MarkerKind, string>> = {
  lost: "I'm lost",
  important: 'Important',
}
const MARKER_KINDS: readonly MarkerKind[] = ['lost', 'important']

/**
 * Phones and tablets (Product Spec §7): the marker buttons become a bar that sticks under the
 * top bar while the student scrolls the transcript, with 44px targets. Fine pointers keep the
 * inline row with L / I hints. `data-touch-bar` raises html's scroll-padding while the bar is
 * sticky (globals.css), so a focused transcript row never scrolls under it (WCAG 2.4.11).
 */
const TOUCH_BAR = cn(
  'max-lg:pointer-coarse:sticky max-lg:pointer-coarse:top-topbar max-lg:pointer-coarse:z-sticky',
  'max-lg:pointer-coarse:grid max-lg:pointer-coarse:grid-cols-2',
  'max-lg:pointer-coarse:bg-background max-lg:pointer-coarse:border-b max-lg:pointer-coarse:py-2',
  'max-lg:pointer-coarse:-mx-4 max-lg:pointer-coarse:px-4',
  'sm:max-lg:pointer-coarse:-mx-6 sm:max-lg:pointer-coarse:px-6',
)
const TOUCH_BUTTON = 'max-lg:pointer-coarse:h-11'

export interface MarkerBarProps {
  canMark: boolean
  /** Id of the "Loading player…" helper while the buttons wait. */
  describedBy?: string
  counts: { lost: number; important: number }
  done: boolean
  onMark: (kind: MarkerKind) => void
  onFinish: () => void
}

/** I'm lost / Important (with L / I hints), the running counts, and "Done watching". */
export function MarkerBar({
  canMark,
  describedBy,
  counts,
  done,
  onMark,
  onFinish,
}: MarkerBarProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 max-lg:pointer-coarse:contents">
      <div data-touch-bar className={cn('flex flex-wrap items-center gap-2', TOUCH_BAR)}>
        {MARKER_KINDS.map((kind) => {
          const Icon = kind === 'lost' ? Flag : Star
          return (
            <Button
              key={kind}
              variant="outline"
              disabled={!canMark}
              aria-keyshortcuts={MARKER_SHORTCUTS[kind]}
              aria-describedby={describedBy}
              onClick={() => onMark(kind)}
              className={TOUCH_BUTTON}
            >
              <Icon
                aria-hidden
                className={cn(
                  'fill-current',
                  kind === 'lost' ? 'text-marker-lost' : 'text-marker-important',
                )}
              />
              {MARKER_LABELS[kind]}
              <KeyHint aria-hidden className="pointer-coarse:hidden">
                {MARKER_SHORTCUTS[kind]}
              </KeyHint>
            </Button>
          )
        })}
        {/* Not a live region: the "Marked: …" toast already announces each marker. */}
        <MarkerCounts
          lost={counts.lost}
          important={counts.important}
          showZero
          className="max-lg:pointer-coarse:col-span-2"
        />
      </div>
      {!done && (
        <Button variant="ghost" className="ml-auto justify-self-start" onClick={onFinish}>
          <Check aria-hidden />
          Done watching
        </Button>
      )}
    </div>
  )
}

function DiagnosticCta({ lectureId, lost }: { lectureId: string; lost: number }) {
  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-heading">Nice work. Now see what actually stuck.</p>
          <p className="text-body-sm text-muted-foreground">
            {lost > 0
              ? 'A short diagnostic starts with the moments you flagged as lost.'
              : 'A short diagnostic checks the key ideas from this lecture.'}
          </p>
        </div>
        <Button asChild>
          <Link href={`/lectures/${lectureId}/diagnostic` as Route}>
            Take the diagnostic
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}

/** What comes after "Done watching": the diagnostic, or the map build while it isn't ready. */
export function DoneCta({
  lecture,
  lost,
  ref,
}: {
  lecture: LectureResponse
  lost: number
  ref: RefObject<HTMLDivElement | null>
}) {
  return (
    <div ref={ref} tabIndex={-1} className="rounded-xl">
      {lecture.status === 'ready' ? (
        <DiagnosticCta lectureId={lecture.id} lost={lost} />
      ) : lecture.status === 'processing' || lecture.status === 'map_ready' ? (
        <MapBuildingNote lectureId={lecture.id} />
      ) : (
        <BuildMapCta lectureId={lecture.id} lost={lost} />
      )}
    </div>
  )
}
