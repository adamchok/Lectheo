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
 * ties keep input order (pass concepts in lecture order). One item per concept before any concept
 * gets a second. Takes up to `targetCount` (from `diagnosticItemCount`).
 * Notes: no markers → `NO_FLAGS_NOTE`; fewer than 3 items → shortened-run note (both joined).
 * Items for concepts not in `concepts` are ignored.
 */
export function planDiagnostic(
  concepts: readonly PlanConcept[],
  items: readonly PlanItem[],
  targetCount: number,
): DiagnosticPlan {
  const orderedConcepts = orderConcepts(concepts)
  const queues = orderedConcepts.map((c) => items.filter((item) => item.conceptId === c.conceptId))
  const picked = roundRobin(queues, Math.max(0, Math.floor(targetCount)))

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

function orderConcepts(concepts: readonly PlanConcept[]): PlanConcept[] {
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
