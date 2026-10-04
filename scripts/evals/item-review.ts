/**
 * Hand check of the eval-items sample (docs/evals/items.csv), keyed concept/kind/variant.
 * Reviewer: Claude (Opus 5.5) in the PR session, reading each item against its key and the cited
 * subtitle segments — not a human review. Add or replace entries when the bank is regenerated.
 */
export interface ItemReview {
  keyCorrect: boolean
  singleAnswer: boolean
  grounded: boolean
  note?: string
}

const ok = (note?: string): ItemReview => ({
  keyCorrect: true,
  singleAnswer: true,
  grounded: true,
  ...(note ? { note } : {}),
})

export const ITEM_REVIEW: Readonly<Record<string, ItemReview>> = {
  'binary_search/diagnostic_mcq/1': ok(
    'Really tests recursion termination, as the window frames it.',
  ),
  'binary_search/transfer/1': ok(),
  'asymptotic_notation/spot_flaw/2': ok(),
  'selection_sort/spot_flaw/2': ok('Correct scenario; every sentence checks out.'),
  'bubble_sort/spot_flaw/1': ok(),
  'recursion/spot_flaw/1': ok(),
  'merge_sort/diagnostic_mcq/2': ok(),
  'strings_as_char_pointers/diagnostic_mcq/2': ok(),
  'malloc_and_null/diagnostic_mcq/1': ok(),
  'memory_leaks/diagnostic_mcq/1': ok(),
  'memory_leaks/transfer/1': ok(),
  'pointers/spot_flaw/2': ok(),
  'pass_by_reference/spot_flaw/2': ok('Correct scenario.'),
  'stack_and_heap/spot_flaw/1': ok(),
  'arrays/spot_flaw/1': ok(),
  'linked_lists/diagnostic_mcq/2': ok('Grounded in one brief mention of doubly linked lists.'),
  'binary_search_trees/diagnostic_mcq/2': ok(),
  'hash_functions/diagnostic_mcq/1': ok(),
  'hash_tables/diagnostic_mcq/2': ok(),
  'tries/diagnostic_mcq/1': ok(),
}
