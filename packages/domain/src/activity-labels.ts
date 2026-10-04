import type { AttemptActivityType } from '@lectheo/contracts'

/** Human labels used in tooltips and reasons (F6.1: "Correct in Diagnostic and Spot the flaw"). */
export const ACTIVITY_LABELS: Readonly<Record<AttemptActivityType, string>> = {
  diagnostic: 'Diagnostic',
  spot_flaw: 'Spot the flaw',
  teach_back: 'Teach-back',
  transfer: 'Transfer problem',
  stump: 'Stump the AI',
}

/** Joins labels as "A", "A and B", "A, B and C". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? ''
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`
}

/** Labels for activity types in canonical (enum) order, deduplicated. */
export function labelTypes(types: Iterable<AttemptActivityType>): string {
  const set = new Set(types)
  const ordered = (Object.keys(ACTIVITY_LABELS) as AttemptActivityType[]).filter((t) => set.has(t))
  return joinLabels(ordered.map((t) => ACTIVITY_LABELS[t]))
}
