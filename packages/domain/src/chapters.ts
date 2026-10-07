import { CHAPTER_SUMMARY_MAX, CHAPTER_TITLE_MAX } from '@lectheo/contracts'
import type { TimedSegment } from './study'

/*
 * Chapter rules (Product Spec F11.1–F11.2, Architecture §4.3 validateGraph). The model names the
 * segment each chapter starts at ([s42]); ends follow from the next start, so times are exact.
 */

/** F11.1: about 8–15 chapters per hour. */
export const CHAPTERS_PER_HOUR = { min: 8, max: 15 } as const
const COUNT_SLACK = 1
const MINUTES_PER_HOUR = 60

export interface ChapterStart<C = string> {
  readonly title: string
  readonly summary: string
  readonly startIdx: number
  readonly concepts: readonly C[]
}

export interface ChapterRange<C = string> extends ChapterStart<C> {
  readonly id: string
  readonly endIdx: number
}

/** "Roughly" 8–15 per hour: one chapter of slack each way, at least 1 and up to 2 allowed. */
export function chapterCountRange(minutes: number): { min: number; max: number } {
  const hours = Math.max(0, minutes) / MINUTES_PER_HOUR
  return {
    min: Math.max(1, Math.floor(hours * CHAPTERS_PER_HOUR.min) - COUNT_SLACK),
    max: Math.max(2, Math.ceil(hours * CHAPTERS_PER_HOUR.max) + COUNT_SLACK),
  }
}

/**
 * Every reason the chapter starts are invalid ([] = valid): at least one, in order without
 * repeats (no overlaps), the first at the first segment (ends follow from the next start, so they
 * then cover the first to the last segment), starts on real segments, known concepts, a sensible
 * count for the lecture's length.
 */
export function chapterErrors<C>(
  starts: readonly ChapterStart<C>[],
  segmentIdxs: readonly number[],
  minutes: number,
  isKnownConcept: (concept: C) => boolean,
): string[] {
  if (starts.length === 0) return ['chapters: none given']
  const sorted = [...segmentIdxs].sort((a, b) => a - b)
  const known = new Set(sorted)
  const { min, max } = chapterCountRange(minutes)
  const errors: string[] = []
  if (starts.length < min || starts.length > max) {
    errors.push(
      `chapters: expected ${min}..${max} for ${Math.round(minutes)} min, got ${starts.length}`,
    )
  }
  if (starts[0]?.startIdx !== sorted[0]) {
    errors.push(`chapters: the first chapter must start at s${sorted[0]}`)
  }
  starts.forEach((c, i) => {
    const where = `chapter ${i + 1} "${c.title}"`
    if (!known.has(c.startIdx)) errors.push(`${where}: unknown segment s${c.startIdx}`)
    const prev = starts[i - 1]
    if (prev && c.startIdx <= prev.startIdx) {
      errors.push(`${where}: must start after chapter ${i} (s${prev.startIdx})`)
    }
    if (c.title.trim().length === 0) errors.push(`${where}: empty title`)
    if (c.title.length > CHAPTER_TITLE_MAX) {
      errors.push(`${where}: title longer than ${CHAPTER_TITLE_MAX} characters`)
    }
    if (c.summary.length > CHAPTER_SUMMARY_MAX) {
      errors.push(`${where}: summary longer than ${CHAPTER_SUMMARY_MAX} characters`)
    }
    for (const concept of c.concepts) {
      if (!isKnownConcept(concept)) errors.push(`${where}: unknown concept "${String(concept)}"`)
    }
  })
  return errors
}

/** Valid starts → ranges with ids `ch1…` and inclusive ends (the last runs to the last segment). */
export function toChapterRanges<C>(
  starts: readonly ChapterStart<C>[],
  lastIdx: number,
): ChapterRange<C>[] {
  return starts.map((c, i) => ({
    ...c,
    concepts: [...new Set(c.concepts)],
    id: `ch${i + 1}`,
    endIdx: (starts[i + 1]?.startIdx ?? lastIdx + 1) - 1,
  }))
}

/** A stored range → times from its segments (null when a segment is missing). */
export function chapterTimes(
  range: { readonly startIdx: number; readonly endIdx: number },
  segments: ReadonlyMap<number, TimedSegment>,
): { startMs: number; endMs: number } | null {
  const start = segments.get(range.startIdx)
  const end = segments.get(range.endIdx)
  return start && end ? { startMs: start.startMs, endMs: end.endMs } : null
}
