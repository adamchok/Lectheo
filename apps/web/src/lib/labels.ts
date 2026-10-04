import type { ActivityType, Relation } from '@lectheo/contracts'

export const ACTIVITY_LABELS: Readonly<Record<ActivityType, string>> = {
  spot_flaw: 'Spot the flaw',
  teach_back: 'Teach-back',
  transfer: 'Transfer problem',
  stump: 'Stump the AI',
}

/** Edge labels read "<from> <label> <to>" (Spec F2.2). */
export const RELATION_LABELS: Readonly<Record<Relation, string>> = {
  depends_on: 'depends on',
  is_a: 'is a type of',
  part_of: 'part of',
  contrasts_with: 'contrasts with',
  causes: 'causes',
  example_of: 'example of',
}
