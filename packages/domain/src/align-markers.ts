import type { MarkerKind } from '@lectheo/contracts'

const SECOND_MS = 1000

/** Architecture §6.1: confusion is felt after the explanation, so "lost" looks further back. */
export const LOST_WINDOW_BEFORE_MS = 60 * SECOND_MS
export const LOST_WINDOW_AFTER_MS = 10 * SECOND_MS
export const IMPORTANT_WINDOW_BEFORE_MS = 30 * SECOND_MS
export const IMPORTANT_WINDOW_AFTER_MS = 15 * SECOND_MS

export const MARKER_WINDOWS: Readonly<Record<MarkerKind, { beforeMs: number; afterMs: number }>> = {
  lost: { beforeMs: LOST_WINDOW_BEFORE_MS, afterMs: LOST_WINDOW_AFTER_MS },
  important: { beforeMs: IMPORTANT_WINDOW_BEFORE_MS, afterMs: IMPORTANT_WINDOW_AFTER_MS },
}

export interface AlignMarkerInput {
  readonly markerId: string
  readonly kind: MarkerKind
  readonly tMs: number
}

export interface AlignSegmentInput {
  readonly idx: number
  readonly startMs: number
  readonly endMs: number
}

/** A concept's occurrence in this lecture (`concept_occurrences.segment_idxs`). */
export interface AlignOccurrenceInput {
  readonly conceptId: string
  readonly segmentIdxs: readonly number[]
}

export interface MarkerAlignment {
  readonly markerId: string
  /** null = unlinked (shown on the lecture timeline, F2.3). */
  readonly conceptId: string | null
  /** Fraction (0–1) of the marker window covered by the chosen concept's segments. */
  readonly overlapScore: number
}

interface TimeWindow {
  readonly startMs: number
  readonly endMs: number
}

/** The time window a marker refers to, clamped at 0 (Architecture §6.1). */
export function markerWindow(kind: MarkerKind, tMs: number): TimeWindow {
  const { beforeMs, afterMs } = MARKER_WINDOWS[kind]
  return { startMs: Math.max(0, tMs - beforeMs), endMs: tMs + afterMs }
}

function overlapMs(window: TimeWindow, segment: AlignSegmentInput): number {
  return Math.max(0, Math.min(window.endMs, segment.endMs) - Math.max(window.startMs, segment.startMs))
}

/**
 * Links each marker to one concept (F2.3, Architecture §6.1).
 *
 * - `markerSegments` = segments overlapping the marker window (positive overlap; untimed `0,0`
 *   segments never overlap, so markers on untimed transcripts stay unlinked).
 * - concept = argmax of time overlap between the window and the concept's occurrence segments.
 * - ties → the concept with the most occurrence segments in the window; then input order.
 * - no overlapping concept → unlinked (`conceptId: null`, `overlapScore: 0`).
 */
export function alignMarkers(
  markers: readonly AlignMarkerInput[],
  segments: readonly AlignSegmentInput[],
  occurrences: readonly AlignOccurrenceInput[],
): MarkerAlignment[] {
  const conceptSegments = groupOccurrences(occurrences)
  return markers.map((marker) => alignOne(marker, segments, conceptSegments))
}

function groupOccurrences(
  occurrences: readonly AlignOccurrenceInput[],
): ReadonlyMap<string, ReadonlySet<number>> {
  const map = new Map<string, Set<number>>()
  for (const { conceptId, segmentIdxs } of occurrences) {
    const set = map.get(conceptId) ?? new Set<number>()
    segmentIdxs.forEach((idx) => set.add(idx))
    map.set(conceptId, set)
  }
  return map
}

function alignOne(
  marker: AlignMarkerInput,
  segments: readonly AlignSegmentInput[],
  conceptSegments: ReadonlyMap<string, ReadonlySet<number>>,
): MarkerAlignment {
  const window = markerWindow(marker.kind, marker.tMs)
  const windowMs = window.endMs - window.startMs
  const inWindow = segments
    .map((segment) => ({ idx: segment.idx, overlap: overlapMs(window, segment) }))
    .filter((s) => s.overlap > 0)

  let best: { conceptId: string; overlap: number; count: number } | null = null
  for (const [conceptId, idxs] of conceptSegments) {
    const hits = inWindow.filter((s) => idxs.has(s.idx))
    if (hits.length === 0) continue
    const overlap = hits.reduce((sum, s) => sum + s.overlap, 0)
    const isBetter =
      best === null || overlap > best.overlap || (overlap === best.overlap && hits.length > best.count)
    if (isBetter) best = { conceptId, overlap, count: hits.length }
  }

  if (best === null || windowMs <= 0) {
    return { markerId: marker.markerId, conceptId: null, overlapScore: 0 }
  }
  return {
    markerId: marker.markerId,
    conceptId: best.conceptId,
    overlapScore: Math.min(1, best.overlap / windowMs),
  }
}
