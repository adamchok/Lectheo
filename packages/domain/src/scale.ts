/** F2.2: about one concept per 3 minutes of lecture. */
export const MINUTES_PER_CONCEPT = 3
export const MIN_CONCEPTS = 3
export const MAX_CONCEPTS = 20
/** F3.1: 3–6 core diagnostic questions. */
export const MIN_DIAGNOSTIC_ITEMS = 3
export const MAX_DIAGNOSTIC_ITEMS = 6
/** Speaking rate used to estimate the length of untimed (plain-text) transcripts. */
export const SPOKEN_WORDS_PER_MINUTE = 150

const MS_PER_MINUTE = 60_000

export interface LectureScale {
  readonly nodes: number
  readonly diagnosticItems: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** F2.2 / Architecture §4.3: `nodes = clamp(round(minutes / 3), 3, 20)`. */
export function conceptCountForMinutes(minutes: number): number {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 0
  return clamp(Math.round(safeMinutes / MINUTES_PER_CONCEPT), MIN_CONCEPTS, MAX_CONCEPTS)
}

/** F3.1 / Architecture §4.3: `diagnosticItems = clamp(ceil(nodes / 2) + 1, 3, 6)`. */
export function diagnosticItemCount(nodes: number): number {
  return clamp(Math.ceil(nodes / 2) + 1, MIN_DIAGNOSTIC_ITEMS, MAX_DIAGNOSTIC_ITEMS)
}

/** Both counts for a lecture of the given length (Architecture §6.4 `scale.ts`). */
export function scaleForMinutes(minutes: number): LectureScale {
  const nodes = conceptCountForMinutes(minutes)
  return { nodes, diagnosticItems: diagnosticItemCount(nodes) }
}

/** Convenience: `scaleForMinutes` from a duration in milliseconds. */
export function scaleForDurationMs(durationMs: number): LectureScale {
  return scaleForMinutes(durationMs / MS_PER_MINUTE)
}

/** Estimated minutes for an untimed transcript (F1.7), at `SPOKEN_WORDS_PER_MINUTE`. */
export function estimateMinutesFromText(text: string): number {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length
  return words / SPOKEN_WORDS_PER_MINUTE
}
