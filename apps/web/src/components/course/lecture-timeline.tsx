import type { CourseMapResponse } from '@lectheo/contracts'
import { Flag, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { formatTimestamp, pluralize } from '@/client/format'

/**
 * Lecture timeline with unlinked markers (F2.3: markers that matched no concept).
 * TODO(feature-concept-map): replace with the visual per-lecture timeline (marker dots on a
 * time axis, seek on click). This list is the accessible baseline and should stay.
 */
export function LectureTimeline({ map }: { map: CourseMapResponse }) {
  const lectures = [...map.lectures].sort((a, b) => a.seq - b.seq)
  const withUnlinked = lectures
    .map((lecture) => ({
      lecture,
      markers: map.unlinkedMarkers
        .filter((marker) => marker.lectureId === lecture.id)
        .sort((a, b) => a.tMs - b.tMs),
    }))
    .filter((entry) => entry.markers.length > 0)

  if (withUnlinked.length === 0) return null

  return (
    <section aria-labelledby="unlinked-heading" className="bg-card border-border rounded-xl border p-5">
      <h2 id="unlinked-heading" className="font-medium">
        Unlinked markers
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        Moments you marked that didn&apos;t match a concept, like an anecdote or admin talk.
        They aren&apos;t used to pick questions.
      </p>
      <ul className="space-y-3">
        {withUnlinked.map(({ lecture, markers }) => (
          <li key={lecture.id} className="space-y-1.5">
            <p className="text-sm">
              <span className="font-medium">{lecture.title}</span>{' '}
              <span className="text-muted-foreground">· {pluralize(markers.length, 'marker')}</span>
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {markers.map((marker) => {
                const Icon = marker.kind === 'lost' ? Flag : Star
                const tone =
                  marker.kind === 'lost'
                    ? 'bg-marker-lost-bg text-marker-lost'
                    : 'bg-marker-important-bg text-marker-important'
                return (
                  <li key={marker.id}>
                    <Link
                      href={`/lectures/${lecture.id}?t=${marker.tMs}#transcript` as Route}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
                    >
                      <Icon aria-hidden className="size-3 fill-current" />
                      <span className="font-mono tabular-nums">{formatTimestamp(marker.tMs)}</span>
                      <span className="sr-only">{marker.kind === 'lost' ? 'lost' : 'important'} marker</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}
