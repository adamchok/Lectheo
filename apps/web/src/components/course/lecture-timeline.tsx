'use client'

import type { CourseMapResponse, MarkerKind } from '@lectheo/contracts'
import { Flag, Star } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'
import { formatTimestamp, formatTimestampLong, pluralize } from '@/client/format'
import { cn } from '@/lib/utils'

export interface TimelineMarker {
  id: string
  lectureId: string
  kind: MarkerKind
  tMs: number
  unlinked: boolean
}

export interface Cluster {
  leftPct: number
  markers: TimelineMarker[]
}

/** One lecture's time axis, in media time like markers' tMs. */
export interface Axis {
  startMs: number
  endMs: number
}

/** Hit area of one dot (WCAG 2.5.8; Design System icon-button size) plus a small gap. */
const DOT_PX = 32
const DOT_GAP_PX = 4
/** Before the track is measured (and in tests): cluster markers closer than this. */
const FALLBACK_CLUSTER_PCT = 4

/** Every live marker of this user, once each (a marker can link to several concepts). */
function collectMarkers(map: CourseMapResponse): TimelineMarker[] {
  const byId = new Map<string, TimelineMarker>()
  for (const m of map.nodes.flatMap((n) => n.moments)) byId.set(m.id, { ...m, unlinked: false })
  for (const m of map.unlinkedMarkers) byId.set(m.id, { ...m, unlinked: true })
  return [...byId.values()].sort((a, b) => a.tMs - b.tMs)
}

type MapLecture = CourseMapResponse['lectures'][number]

/** The real lecture length (F2.11); without one, the axis runs to just past the last marker. */
export function lectureAxis(lecture: MapLecture, markers: readonly TimelineMarker[]): Axis {
  const { startMs, durationMs } = lecture
  if (durationMs) return { startMs, endMs: startMs + durationMs }
  return {
    startMs,
    endMs: startMs + Math.max(60_000, ((markers.at(-1)?.tMs ?? 0) - startMs) * 1.05),
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/** Where `ms` sits on the axis, 0–100. */
const axisPct = (ms: number, { startMs, endMs }: Axis) =>
  clamp(((ms - startMs) / Math.max(1, endMs - startMs)) * 100, 0, 100)

/**
 * Dots kept inside the track (a 32px dot centred at least 16px from each end), then markers too
 * close to get their own dot share one at the first marker's position. Unmeasured (width 0): no
 * clamping here (CSS clamps the dot) and a fixed cluster gap.
 */
export function clusterMarkers(
  markers: readonly TimelineMarker[],
  axis: Axis,
  widthPx: number,
): Cluster[] {
  const edgePct = widthPx > 0 ? Math.min(50, (DOT_PX / 2 / widthPx) * 100) : 0
  const minGapPct = widthPx > 0 ? ((DOT_PX + DOT_GAP_PX) / widthPx) * 100 : FALLBACK_CLUSTER_PCT
  const clusters: Cluster[] = []
  for (const marker of markers) {
    const leftPct = clamp(axisPct(marker.tMs, axis), edgePct, 100 - edgePct)
    const last = clusters.at(-1)
    if (last && leftPct - last.leftPct < minGapPct) {
      clusters[clusters.length - 1] = { ...last, markers: [...last.markers, marker] }
    } else {
      clusters.push({ leftPct, markers: [marker] })
    }
  }
  return clusters
}

/** An element's width, kept current with a ResizeObserver (0 until measured). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  // Before paint, so the first frame already clusters at the real width.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

const markerHref = (marker: TimelineMarker) =>
  `/lectures/${marker.lectureId}?t=${marker.tMs}#transcript` as Route
/** 32px link around a 24px dot, so neighbouring targets never overlap. */
const linkClass = 'group flex size-8 items-center justify-center rounded-full'
const dotClass =
  'flex size-6 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-110'

function MarkerDot({ marker }: { marker: TimelineMarker }) {
  const lost = marker.kind === 'lost'
  const Icon = lost ? Flag : Star
  const suffix = marker.unlinked ? ', unlinked' : ''
  return (
    <Link
      href={markerHref(marker)}
      aria-label={`${lost ? 'Lost' : 'Important'} at ${formatTimestampLong(marker.tMs)}${suffix}`}
      title={`${formatTimestamp(marker.tMs)}${marker.unlinked ? ' · unlinked' : ''}`}
      className={linkClass}
    >
      <span
        className={cn(
          dotClass,
          lost ? 'text-marker-lost' : 'text-marker-important',
          marker.unlinked && 'bg-card border-dashed border-current',
          !marker.unlinked && 'border-transparent',
          !marker.unlinked && (lost ? 'bg-marker-lost-bg' : 'bg-marker-important-bg'),
        )}
      >
        <Icon aria-hidden className={cn('size-3.5', !marker.unlinked && 'fill-current')} />
      </span>
    </Link>
  )
}

/** Several markers within one dot's width: their count, opening the first of them. */
function ClusterDot({ markers }: { markers: readonly TimelineMarker[] }) {
  const first = markers[0]!
  const last = markers.at(-1)!
  const lost = markers.filter((m) => m.kind === 'lost').length
  const important = markers.length - lost
  const kinds = [lost > 0 && `${lost} lost`, important > 0 && `${important} important`]
    .filter(Boolean)
    .join(', ')
  const from = formatTimestampLong(first.tMs)
  const to = formatTimestampLong(last.tMs)
  return (
    <Link
      href={markerHref(first)}
      aria-label={`${markers.length} markers from ${from} to ${to}: ${kinds}`}
      title={`${formatTimestamp(first.tMs)} to ${formatTimestamp(last.tMs)} · ${kinds}`}
      className={linkClass}
    >
      <span
        className={cn(
          dotClass,
          'text-caption border-transparent font-medium tabular-nums',
          important === 0 && 'bg-marker-lost-bg text-marker-lost',
          lost === 0 && 'bg-marker-important-bg text-marker-important',
          lost > 0 && important > 0 && 'bg-muted text-foreground',
        )}
      >
        {markers.length}
      </span>
    </Link>
  )
}

/** A dot's centre, never closer than half a dot to either end of the track. */
const dotLeft = (pct: number) => `clamp(${DOT_PX / 2}px, ${pct}%, calc(100% - ${DOT_PX / 2}px))`

interface MarkerTrackProps {
  lecture: MapLecture
  markers: readonly TimelineMarker[]
}

function MarkerTrack({ lecture, markers }: MarkerTrackProps) {
  const [track, width] = useWidth<HTMLDivElement>()
  const axis = lectureAxis(lecture, markers)
  const clusters = clusterMarkers(markers, axis, width)
  // The first chapter starts the lecture: no tick there (like the Watch bar).
  // A chapter within one dot of the start (a library window opening a few seconds into it) also
  // gets no tick: it would read as part of the track's end.
  const minTickPct = width > 0 ? (DOT_PX / width) * 100 : 0
  const ticks = lecture.chapterStartsMs.filter((ms) => {
    const pct = axisPct(ms, axis)
    return ms > axis.startMs && ms < axis.endMs && pct > minTickPct
  })
  const range = lecture.durationMs
    ? `, ${formatTimestampLong(axis.startMs)} to ${formatTimestampLong(axis.endMs)}`
    : ''
  return (
    <div className="space-y-1">
      <div ref={track} className="relative h-8">
        <span aria-hidden className="bg-border absolute inset-x-0 top-1/2 h-px" />
        {ticks.map((ms, i) => (
          <span
            key={`${i}-${ms}`}
            aria-hidden
            data-testid="chapter-tick"
            className="bg-muted-foreground absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${axisPct(ms, axis)}%` }}
          />
        ))}
        <ul aria-label={`Markers in ${lecture.title}${range}`}>
          {clusters.map((cluster) => (
            <li
              key={cluster.markers[0]!.id}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: dotLeft(cluster.leftPct) }}
            >
              {cluster.markers.length === 1 ? (
                <MarkerDot marker={cluster.markers[0]!} />
              ) : (
                <ClusterDot markers={cluster.markers} />
              )}
            </li>
          ))}
        </ul>
      </div>
      {/* The range is in the list's name; screen readers skip the bare times. */}
      {range && (
        <p
          aria-hidden
          className="text-mono-sm text-muted-foreground flex justify-between tabular-nums"
        >
          <span>{formatTimestamp(axis.startMs)}</span>
          <span>{formatTimestamp(axis.endMs)}</span>
        </p>
      )}
    </div>
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
      className="bg-card border-border rounded-lg border p-5"
    >
      <h2 id="timeline-heading" className="text-title-md">
        Your markers
      </h2>
      <p className="text-muted-foreground text-body-sm mb-4">
        Where you flagged or starred each lecture. Select one to jump to that moment.
      </p>
      <ul className="space-y-4">
        {lectures.map(({ lecture, markers: own }) => (
          <li key={lecture.id} className="space-y-1">
            <p className="text-body-sm break-words">
              <span className="font-medium">{lecture.title}</span>{' '}
              <span className="text-muted-foreground">· {pluralize(own.length, 'marker')}</span>
            </p>
            <MarkerTrack lecture={lecture} markers={own} />
          </li>
        ))}
      </ul>
      {hasUnlinked && (
        <p className="text-muted-foreground text-caption mt-4">
          Dashed markers are unlinked: moments that didn&apos;t match a concept, like an anecdote or
          admin talk. They aren&apos;t used to pick questions.
        </p>
      )}
    </section>
  )
}
