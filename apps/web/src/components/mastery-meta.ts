import type { MasteryState } from '@lectheo/contracts'
import { CircleAlert, CircleCheck, CircleDashed, CircleEllipsis, type LucideIcon } from 'lucide-react'

export interface MasteryMeta {
  label: string
  icon: LucideIcon
  /** Text + soft background, AA in both themes. */
  badgeClass: string
  /** Solid fill for bars and map rings. */
  solidClass: string
  textClass: string
}

/** Spec F6: gray "Not tested" · red "Needs work" · amber "Getting there" · green "Mastered". */
export const MASTERY_META: Readonly<Record<MasteryState, MasteryMeta>> = {
  gray: {
    label: 'Not tested',
    icon: CircleDashed,
    badgeClass: 'bg-mastery-gray-bg text-mastery-gray',
    solidClass: 'bg-mastery-gray-solid',
    textClass: 'text-mastery-gray',
  },
  red: {
    label: 'Needs work',
    icon: CircleAlert,
    badgeClass: 'bg-mastery-red-bg text-mastery-red',
    solidClass: 'bg-mastery-red-solid',
    textClass: 'text-mastery-red',
  },
  amber: {
    label: 'Getting there',
    icon: CircleEllipsis,
    badgeClass: 'bg-mastery-amber-bg text-mastery-amber',
    solidClass: 'bg-mastery-amber-solid',
    textClass: 'text-mastery-amber',
  },
  green: {
    label: 'Mastered',
    icon: CircleCheck,
    badgeClass: 'bg-mastery-green-bg text-mastery-green',
    solidClass: 'bg-mastery-green-solid',
    textClass: 'text-mastery-green',
  },
}

/** Display order from most to least progress. */
export const MASTERY_ORDER: readonly MasteryState[] = ['green', 'amber', 'red', 'gray']

/** Tally states into gray/red/amber/green counts (same shape as the API's MasteryCounts). */
export function countMastery(states: readonly MasteryState[]): Record<MasteryState, number> {
  const counts: Record<MasteryState, number> = { gray: 0, red: 0, amber: 0, green: 0 }
  for (const state of states) counts[state] += 1
  return counts
}
