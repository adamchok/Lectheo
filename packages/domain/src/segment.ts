import type { Cue } from './cue'
import { endsSentence, splitSentences } from './sentences'

/** Architecture §4.3 "segment": sentence groups ≤ 40 s. */
export const MAX_SEGMENT_MS = 40_000
/** Untimed text: aim for this many sentences per segment… */
export const UNTIMED_TARGET_SENTENCES = 4
/** …closing early at a paragraph break once this many are collected… */
export const UNTIMED_MIN_SENTENCES = 3
/** …and never more than this (a short tail is merged into the previous segment up to it). */
export const UNTIMED_MAX_SENTENCES = 5

export interface Segment {
  readonly idx: number
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}

export interface SegmentOptions {
  /** Defaults to "any cue has a non-zero end time". */
  readonly hasTimestamps?: boolean
  readonly maxSegmentMs?: number
}

interface Piece {
  readonly startMs: number
  readonly endMs: number
  readonly text: string
  readonly endsSentence: boolean
}

/**
 * Groups cues into transcript segments (Architecture §4.3 `segment`, Data Model
 * `transcript_segments`). Indexes are stable and start at 0.
 *
 * Timed: cue fragments are merged into sentences and sentences into groups whose span is
 * ≤ `maxSegmentMs` (40 s). Groups prefer to end on a sentence boundary; a run-on sentence is cut
 * at a cue boundary instead. Only a single cue longer than the limit yields a longer segment.
 * Untimed (plain text): ~3–5 sentences per segment, times `0, 0`.
 */
export function segmentCues(cues: readonly Cue[], options: SegmentOptions = {}): Segment[] {
  const hasTimestamps = options.hasTimestamps ?? cues.some((cue) => cue.endMs > 0)
  const groups = hasTimestamps
    ? groupTimed(cues.flatMap(toPieces), options.maxSegmentMs ?? MAX_SEGMENT_MS)
    : groupUntimed(cues)
  return groups
    .map((pieces) => toSegmentBody(pieces, hasTimestamps))
    .filter((body) => body.text.length > 0)
    .map((body, idx) => ({ idx, ...body }))
}

/** Splits a cue into sentence pieces, interpolating times by character offset. */
function toPieces(cue: Cue): Piece[] {
  const sentences = splitSentences(cue.text)
  const totalChars = sentences.reduce((sum, s) => sum + s.length, 0) || 1
  const duration = cue.endMs - cue.startMs
  let offset = 0
  return sentences.map((text, i) => {
    const startMs = cue.startMs + Math.round((offset / totalChars) * duration)
    offset += text.length
    const isLast = i === sentences.length - 1
    const endMs = isLast ? cue.endMs : cue.startMs + Math.round((offset / totalChars) * duration)
    return { startMs, endMs, text, endsSentence: endsSentence(text) }
  })
}

function groupTimed(pieces: readonly Piece[], maxMs: number): Piece[][] {
  const groups: Piece[][] = []
  let current: Piece[] = []
  for (const piece of pieces) {
    while (current.length > 0 && piece.endMs - (current[0]?.startMs ?? 0) > maxMs) {
      const cut = cutIndex(current)
      groups.push(current.slice(0, cut))
      current = current.slice(cut)
    }
    current = [...current, piece]
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/** Cut after the last sentence end that leaves a non-empty remainder; else take everything. */
function cutIndex(pieces: readonly Piece[]): number {
  const lastEnd = pieces.findLastIndex((piece) => piece.endsSentence)
  return lastEnd >= 0 && lastEnd < pieces.length - 1 ? lastEnd + 1 : pieces.length
}

function groupUntimed(cues: readonly Cue[]): Piece[][] {
  const groups: Piece[][] = []
  let current: Piece[] = []
  for (const cue of cues) {
    for (const text of splitSentences(cue.text)) {
      current = [...current, { startMs: 0, endMs: 0, text, endsSentence: true }]
      if (current.length >= UNTIMED_TARGET_SENTENCES) {
        groups.push(current)
        current = []
      }
    }
    // Paragraph break: close a group that is already big enough.
    if (current.length >= UNTIMED_MIN_SENTENCES) {
      groups.push(current)
      current = []
    }
  }
  if (current.length === 0) return groups
  const previous = groups.at(-1)
  if (previous && previous.length + current.length <= UNTIMED_MAX_SENTENCES) {
    return [...groups.slice(0, -1), [...previous, ...current]]
  }
  return [...groups, current]
}

function toSegmentBody(pieces: readonly Piece[], hasTimestamps: boolean): Omit<Segment, 'idx'> {
  const text = pieces.map((piece) => piece.text).join(' ').replace(/\s+/g, ' ').trim()
  if (!hasTimestamps) return { startMs: 0, endMs: 0, text }
  const startMs = Math.min(...pieces.map((piece) => piece.startMs))
  const endMs = Math.max(...pieces.map((piece) => piece.endMs))
  return { startMs, endMs, text }
}
