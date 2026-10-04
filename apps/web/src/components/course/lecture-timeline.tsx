import type { CourseMapResponse, MarkerKind } from '@lectheo/contracts'
import { Flag, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { formatTimestamp, formatTimestampLong, pluralize } from '@/client/format'
import { cn } from '@/lib/utils'

interface TimelineMarker {
  id: string
  lectureId: string
  kind: MarkerKind
  tMs: number
  unlinked: boolean
}

/** Every live marker of this user, once each (a marker can link to several concepts). */
function collectMarkers(map: CourseMapResponse): TimelineMarker[] {
  const byId = new Map<string, TimelineMarker>()
  for (const m of map.nodes.flatMap((n) => n.moments)) byId.set(m.id, { ...m, unlinked: false })
  for (const m of map.unlinkedMarkers) byId.set(m.id, { ...m, unlinked: true })
  return [...byId.values()].sort((a, b) => a.tMs - b.tMs)
}

/** Lecture length isn't in the map payload; the axis runs to just past the last marker. */
const axisEnd = (markers: readonly TimelineMarker[]) =>
  Math.max(60_000, (markers.at(-1)?.tMs ?? 0) * 1.05)

function MarkerDot({ marker, endMs }: { marker: TimelineMarker; endMs: number }) {
  const lost = marker.kind === 'lost'
  const Icon = lost ? Flag : Star
  const suffix = marker.unlinked ? ', unlinked' : ''
  return (
    <li
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(marker.tMs / endMs) * 100}%` }}
    >
      <Link
        href={`/lectures/${marker.lectureId}?t=${marker.tMs}#transcript` as Route}
        aria-label={`${lost ? 'Lost' : 'Important'} at ${formatTimestampLong(marker.tMs)}${suffix}`}
        title={`${formatTimestamp(marker.tMs)}${marker.unlinked ? ' · unlinked' : ''}`}
        className={cn(
          'flex size-6 items-center justify-center rounded-full border-2 transition-transform hover:scale-110',
          lost ? 'text-marker-lost' : 'text-marker-important',
          marker.unlinked && 'bg-card border-dashed border-current',
          !marker.unlinked && 'border-transparent',
          !marker.unlinked && (lost ? 'bg-marker-lost-bg' : 'bg-marker-important-bg'),
        )}
      >
        <Icon aria-hidden className={cn('size-3', !marker.unlinked && 'fill-current')} />
      </Link>
    </li>
  )
}

/**
 * Per-lecture timeline of this user's markers (F2.3). Unlinked markers (matched no concept) are
 * hollow with a dashed ring. Each marker opens the lecture at that moment.
 */
export function LectureTimeline({ map }: { map: CourseMapResponse }) {
  const markers = collectMarkers(map)
  const lectures = [...map.lectures]
    .sort((a, b) => a.seq - b.seq)
    .map((lecture) => ({ lecture, markers: markers.filter((m) => m.lectureId === lecture.id) }))
    .filter((entry) => entry.markers.length > 0)

  if (lectures.length === 0) return null
  const hasUnlinked = markers.some((m) => m.unlinked)

  return (
    <section
      aria-labelledby="timeline-heading"
      className="bg-card border-border rounded-xl border p-5"
    >
      <h2 id="timeline-heading" className="font-medium">
        Your markers
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Where you flagged or starred each lecture. Select one to jump to that moment.
      </p>
      <ul className="space-y-4">
        {lectures.map(({ lecture, markers: own }) => {
          const endMs = axisEnd(own)
          return (
            <li key={lecture.id} className="space-y-1">
              <p className="text-sm">
                <span className="font-medium">{lecture.title}</span>{' '}
                <span className="text-muted-foreground">· {pluralize(own.length, 'marker')}</span>
              </p>
              <div className="relative mx-3 h-8">
                <span aria-hidden className="bg-border absolute inset-x-0 top-1/2 h-px" />
                <ul aria-label={`Markers in ${lecture.title}`}>
                  {own.map((marker) => (
                    <MarkerDot key={marker.id} marker={marker} endMs={endMs} />
                  ))}
                </ul>
              </div>
            </li>
          )
        })}
      </ul>
      {hasUnlinked && (
        <p className="text-muted-foreground mt-4 text-xs">
          Dashed markers are unlinked: moments that didn&apos;t match a concept, like an anecdote or
          admin talk. They aren&apos;t used to pick questions.
        </p>
      )}
    </section>
  )
}
