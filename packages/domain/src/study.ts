import type { GraphEdge } from './graph'

/* Study brief rules (Product Spec F9, Architecture §6.1): learning order, clips, reading time. */

/** F9.5: reading speed for "about M min to read". */
export const READ_WORDS_PER_MINUTE = 200

export interface OrderedConcept {
  readonly id: string
  /** Index of the concept's first source segment in this lecture (first appearance). */
  readonly firstIdx: number
}

/**
 * F9.2 learning order: prerequisites first (`depends_on` edges point from a concept to what it
 * builds on), ties by first appearance. Edges to concepts outside the list are ignored. A cycle
 * can't happen (the course's depends_on edges are a DAG), but if one did, the remaining concepts
 * are appended by first appearance instead of being dropped.
 */
export function learningOrder(
  concepts: readonly OrderedConcept[],
  edges: readonly GraphEdge[],
): string[] {
  const byAppearance = [...concepts].sort(
    (a, b) => a.firstIdx - b.firstIdx || (a.id < b.id ? -1 : 1),
  )
  const ids = new Set(byAppearance.map((c) => c.id))
  const prereqs = new Map<string, Set<string>>(byAppearance.map((c) => [c.id, new Set<string>()]))
  for (const e of edges) {
    if (e.relation !== 'depends_on' || e.from === e.to) continue
    if (ids.has(e.from) && ids.has(e.to)) prereqs.get(e.from)?.add(e.to)
  }
  const placed = new Set<string>()
  const order: string[] = []
  // ponytail: O(n²) scan; a lecture has at most 20 concepts.
  for (;;) {
    const next = byAppearance.find(
      (c) => !placed.has(c.id) && [...(prereqs.get(c.id) ?? [])].every((p) => placed.has(p)),
    )
    if (!next) break
    placed.add(next.id)
    order.push(next.id)
  }
  return [...order, ...byAppearance.filter((c) => !placed.has(c.id)).map((c) => c.id)]
}

export interface TimedSegment {
  readonly idx: number
  readonly startMs: number
  readonly endMs: number
}

export interface Clip {
  readonly startMs: number
  readonly endMs: number
}

/**
 * F9.3: a concept's source segments as playable ranges, neighbouring segments (consecutive
 * indexes) merged. Unknown indexes are skipped; ranges come out in time order.
 */
export function mergeClips(segments: readonly TimedSegment[], idxs: readonly number[]): Clip[] {
  const byIdx = new Map(segments.map((s) => [s.idx, s]))
  const wanted = [...new Set(idxs)].filter((i) => byIdx.has(i)).sort((a, b) => a - b)
  const clips: { startMs: number; endMs: number; lastIdx: number }[] = []
  for (const idx of wanted) {
    const seg = byIdx.get(idx)!
    const last = clips.at(-1)
    if (last && idx === last.lastIdx + 1) {
      clips[clips.length - 1] = { ...last, endMs: Math.max(last.endMs, seg.endMs), lastIdx: idx }
    } else {
      clips.push({ startMs: seg.startMs, endMs: seg.endMs, lastIdx: idx })
    }
  }
  return clips.map(({ startMs, endMs }) => ({ startMs, endMs }))
}

/** Total playing time of the clips. */
export const clipMs = (clips: readonly Clip[]): number =>
  clips.reduce((sum, c) => sum + Math.max(0, c.endMs - c.startMs), 0)

export const wordCount = (text: string): number =>
  text.split(/\s+/).filter((w) => w.length > 0).length

/** F9.5: words ÷ 200, rounded up (0 for no text). */
export const readMinutes = (texts: readonly string[]): number =>
  Math.ceil(texts.reduce((n, t) => n + wordCount(t), 0) / READ_WORDS_PER_MINUTE)

/** F9.5: the brief's reading time: concept names, summaries and key points. */
export const briefReadMinutes = (
  concepts: readonly {
    readonly name: string
    readonly summary: string
    readonly keyPoints: readonly { readonly text: string }[]
  }[],
): number =>
  readMinutes(concepts.flatMap((c) => [c.name, c.summary, ...c.keyPoints.map((k) => k.text)]))
