import { MIN_DIAGNOSTIC_ITEMS } from './scale'

export const NO_FLAGS_NOTE = "No flags this time. Here's a general check."

/** F3.7 note when fewer than `MIN_DIAGNOSTIC_ITEMS` verified questions are available. */
export function shortenedRunNote(count: number): string {
  if (count === 0) return 'No verified questions are ready for this lecture yet.'
  const noun = count === 1 ? 'question is' : 'questions are'
  return `Only ${count} verified ${noun} ready, so this check is shorter than usual.`
}

export interface PlanConcept {
  readonly conceptId: string
  readonly lostCount: number
  readonly importantCount: number
  /** F3.9: the concept's home chapter (0-based, chapter order); null/absent without chapters. */
  readonly chapterIndex?: number | null
}

/** An unseen, verified diagnostic item (pass in preferred order, e.g. by variant). */
export interface PlanItem {
  readonly itemId: string
  readonly conceptId: string
}

export interface DiagnosticPlan {
  readonly itemIds: readonly string[]
  readonly note?: string
}

/**
 * Picks the core diagnostic questions (F3.1, F3.7, Architecture §4.4).
 *
 * Concept order: marked lost (most lost markers first) → marked important → unmarked baseline;
 * ties keep input order (pass concepts in learning order). Baseline concepts are spread (F3.9):
 * one per chapter in turn, or evenly through the lecture without chapters. One item per concept
 * before any concept gets a second. Takes up to `targetCount` (from `diagnosticItemCount`).
 * Notes: no markers → `NO_FLAGS_NOTE`; fewer than 3 items → shortened-run note (both joined).
 * Items for concepts not in `concepts` are ignored.
 */
export function planDiagnostic(
  concepts: readonly PlanConcept[],
  items: readonly PlanItem[],
  targetCount: number,
): DiagnosticPlan {
  const limit = Math.max(0, Math.floor(targetCount))
  const withItems = concepts.filter((c) => items.some((item) => item.conceptId === c.conceptId))
  const marked = orderMarked(withItems.filter((c) => tier(c) < 2))
  const baseline = spreadBaseline(
    withItems.filter((c) => tier(c) === 2),
    Math.max(0, limit - marked.length),
  )
  const queues = [...marked, ...baseline].map((c) =>
    items.filter((item) => item.conceptId === c.conceptId),
  )
  const picked = roundRobin(queues, limit)

  const hasMarkers = concepts.some((c) => c.lostCount > 0 || c.importantCount > 0)
  const notes = [
    hasMarkers ? null : NO_FLAGS_NOTE,
    picked.length < MIN_DIAGNOSTIC_ITEMS ? shortenedRunNote(picked.length) : null,
  ].filter((n): n is string => n !== null)

  const itemIds = picked.map((item) => item.itemId)
  return notes.length > 0 ? { itemIds, note: notes.join(' ') } : { itemIds }
}

function tier(concept: PlanConcept): number {
  if (concept.lostCount > 0) return 0
  if (concept.importantCount > 0) return 1
  return 2
}

function orderMarked(concepts: readonly PlanConcept[]): PlanConcept[] {
  return concepts
    .map((concept, order) => ({ concept, order }))
    .sort(
      (a, b) =>
        tier(a.concept) - tier(b.concept) ||
        b.concept.lostCount - a.concept.lostCount ||
        b.concept.importantCount - a.concept.importantCount ||
        a.order - b.order,
    )
    .map(({ concept }) => concept)
}

/** `k` indices spread evenly over `0..n-1` (all of them when k ≥ n), ascending. */
export function evenSpread(n: number, k: number): number[] {
  if (k >= n) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: k }, (_, i) => Math.floor(((i + 0.5) * n) / k))
}

/**
 * F3.9: baseline concepts grouped by chapter (each concept its own group without chapters), then
 * taken one per group in turn. When the first pass has more groups than `slots`, the groups it
 * visits first are spread evenly, so a short run never asks only about the start.
 */
function spreadBaseline(concepts: readonly PlanConcept[], slots: number): PlanConcept[] {
  const hasChapters = concepts.some((c) => c.chapterIndex != null)
  const groups: PlanConcept[][] = []
  if (hasChapters) {
    const byChapter = new Map<number, PlanConcept[]>()
    for (const c of concepts) {
      const key = c.chapterIndex ?? Number.MAX_SAFE_INTEGER
      byChapter.set(key, [...(byChapter.get(key) ?? []), c])
    }
    groups.push(...[...byChapter.entries()].sort(([a], [b]) => a - b).map(([, list]) => list))
  } else {
    groups.push(...concepts.map((c) => [c]))
  }
  const first = evenSpread(groups.length, slots)
  const order = [...first, ...groups.keys()].filter((g, i, all) => all.indexOf(g) === i)
  const picked: PlanConcept[] = order.map((g) => groups[g]?.[0] as PlanConcept)
  const longest = Math.max(0, ...groups.map((g) => g.length))
  for (let round = 1; round < longest; round++) {
    for (const group of groups) {
      const c = group[round]
      if (c) picked.push(c)
    }
  }
  return picked
}

function roundRobin(queues: readonly (readonly PlanItem[])[], limit: number): PlanItem[] {
  const picked: PlanItem[] = []
  const longest = Math.max(0, ...queues.map((q) => q.length))
  for (let round = 0; round < longest && picked.length < limit; round++) {
    for (const queue of queues) {
      const item = queue[round]
      if (item && picked.length < limit) picked.push(item)
    }
  }
  return picked
}

/** F3.10: concepts per *Test the rest* round. */
export const MAX_REST_ITEMS = 8

export interface RestConcept {
  readonly conceptId: string
  readonly chapterIndex?: number | null
  /** Mastery is not *Not tested* (any round, any activity). */
  readonly tested: boolean
}

/**
 * F3.10: one unseen verified item per concept still untested, in chapter order (input order —
 * learning order — inside a chapter), at most `MAX_REST_ITEMS`. Concepts without an item are
 * skipped (F3.11). Pass items in preferred order (the first one per concept is taken).
 */
export function planRestRound(
  concepts: readonly RestConcept[],
  items: readonly PlanItem[],
): string[] {
  return byChapterOrder(concepts)
    .filter((c) => !c.tested)
    .flatMap((c) => items.find((item) => item.conceptId === c.conceptId)?.itemId ?? [])
    .slice(0, MAX_REST_ITEMS)
}

/** Stable sort by chapter; concepts without a chapter keep their place after the chapters. */
const byChapterOrder = <C extends { readonly chapterIndex?: number | null }>(
  concepts: readonly C[],
): C[] =>
  [...concepts].sort(
    (a, b) =>
      (a.chapterIndex ?? Number.MAX_SAFE_INTEGER) - (b.chapterIndex ?? Number.MAX_SAFE_INTEGER),
  )

export interface CoverageConcept extends RestConcept {
  /** A verified diagnostic question on it exists (F3.11). */
  readonly hasQuestion: boolean
}

export interface Coverage {
  readonly tested: number
  readonly total: number
  readonly noQuestion: number
  readonly untested: number
  /** Per chapter index (only chapters with concepts, so indices can skip), in chapter order. */
  readonly byChapter: readonly { chapterIndex: number; tested: number; total: number }[]
}

/**
 * F3.10–F3.11 coverage line. Every concept is in exactly one bucket, so tested + noQuestion +
 * untested = total: tested (any round or activity), else no verified question (`noQuestion`),
 * else `untested`. *Test the rest* asks the untested ones it still has an unseen question for.
 */
export function diagnosticCoverage(concepts: readonly CoverageConcept[]): Coverage {
  const chapters = new Map<number, { tested: number; total: number }>()
  for (const c of concepts) {
    if (c.chapterIndex == null) continue
    const prev = chapters.get(c.chapterIndex) ?? { tested: 0, total: 0 }
    chapters.set(c.chapterIndex, {
      tested: prev.tested + (c.tested ? 1 : 0),
      total: prev.total + 1,
    })
  }
  return {
    tested: concepts.filter((c) => c.tested).length,
    total: concepts.length,
    noQuestion: concepts.filter((c) => !c.tested && !c.hasQuestion).length,
    untested: concepts.filter((c) => !c.tested && c.hasQuestion).length,
    byChapter: [...chapters.entries()]
      .sort(([a], [b]) => a - b)
      .map(([chapterIndex, counts]) => ({ chapterIndex, ...counts })),
  }
}

/**
 * The chapter a concept sits in: the last chapter starting at or before its first segment in this
 * lecture (chapters cover the first to the last segment). Null without chapters.
 */
export function homeChapterIndex(
  chapterStartIdxs: readonly number[],
  firstSegmentIdx: number,
): number | null {
  if (chapterStartIdxs.length === 0) return null
  const at = chapterStartIdxs.findLastIndex((start) => start <= firstSegmentIdx)
  return Math.max(0, at)
}
