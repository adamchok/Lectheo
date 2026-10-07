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

export interface StudyChapter {
  readonly id: string
  readonly startMs: number
  readonly endMs: number
  /** Concepts the chapter says it teaches (may be wrong about where they first appear). */
  readonly conceptIds: readonly string[]
}

export interface ChapterPlacement {
  readonly id: string
  /** The chapter of the concept's first moment; null only when the lecture has no chapters. */
  readonly chapterId: string | null
  /** Later chapters that revisit it ("Also revisits: Hash functions →"). */
  readonly alsoIn: readonly string[]
}

const distanceMs = (c: StudyChapter, t: number): number =>
  t < c.startMs ? c.startMs - t : t > c.endMs ? t - c.endMs : 0

/** Index of the chapter at `t`, else the nearest one; at a shared boundary the later one wins. */
function chapterIndexAt(chapters: readonly StudyChapter[], t: number): number {
  let best = 0
  chapters.forEach((c, i) => {
    if (distanceMs(c, t) <= distanceMs(chapters[best] as StudyChapter, t)) best = i
  })
  return best
}

/**
 * F9.10: the brief by chapter. `concepts` come in learning order with the start of each source
 * moment. A concept sits in the chapter of its first moment (outside every chapter: the nearest
 * one; no moments: the first chapter that lists it, else the first chapter). Later chapters that
 * list it or hold one of its moments go in `alsoIn`. Returned by chapter, learning order within
 * one. No chapters: learning order unchanged (F9.2's flat list).
 */
export function byChapter(
  concepts: readonly { readonly id: string; readonly momentsMs: readonly number[] }[],
  chapters: readonly StudyChapter[],
): ChapterPlacement[] {
  if (chapters.length === 0) return concepts.map((c) => ({ id: c.id, chapterId: null, alsoIn: [] }))
  const placed = concepts.map((c) => {
    const listed = chapters.findIndex((ch) => ch.conceptIds.includes(c.id))
    const home =
      c.momentsMs.length > 0
        ? chapterIndexAt(chapters, Math.min(...c.momentsMs))
        : Math.max(0, listed)
    const revisits = new Set(c.momentsMs.map((t) => chapterIndexAt(chapters, t)))
    const alsoIn = chapters
      .filter((ch, i) => i > home && (revisits.has(i) || ch.conceptIds.includes(c.id)))
      .map((ch) => ch.id)
    return { id: c.id, chapterId: chapters[home]?.id ?? null, alsoIn, home }
  })
  // Array.prototype.sort is stable, so learning order holds within a chapter.
  return placed
    .sort((a, b) => a.home - b.home)
    .map(({ id, chapterId, alsoIn }) => ({ id, chapterId, alsoIn }))
}

/** F9.13: the text of an "Explain in depth" (code included), for its reading time. */
export const depthTexts = (depth: {
  readonly howItWorks: readonly { readonly text: string }[]
  readonly example: { readonly text: string; readonly code?: string } | null
  readonly mistakes: readonly { readonly mistake: string; readonly why: string }[]
}): string[] => [
  ...depth.howItWorks.map((p) => p.text),
  ...(depth.example ? [depth.example.text, depth.example.code ?? ''] : []),
  ...depth.mistakes.flatMap((m) => [m.mistake, m.why]),
]
