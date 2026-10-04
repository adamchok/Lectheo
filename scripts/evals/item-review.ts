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
  'binary_search/diagnostic_mcq/1': ok('Tests recursion termination, as the window frames it.'),
  'binary_search/transfer/1': ok(),
  'asymptotic_notation/transfer/1': ok(),
  'selection_sort/spot_flaw/2': ok('Correct scenario; every sentence checks out.'),
  'bubble_sort/spot_flaw/2': ok(
    'Sentence 0 ties "sorted list" to the worst case awkwardly, but is true.',
  ),
  'recursion/spot_flaw/1': ok(),
  'merge_sort/spot_flaw/1': ok(),
  'strings_as_char_pointers/diagnostic_mcq/2': ok(),
  'malloc_and_null/diagnostic_mcq/2': ok(),
  'memory_leaks/diagnostic_mcq/1': ok('Revised after PR review: now a leak, not an invalid write.'),
  'pointers/diagnostic_mcq/1': ok(),
  'pointers/transfer/1': ok(),
  'pass_by_reference/transfer/1': ok(),
  'stack_and_heap/spot_flaw/2': ok(
    'Revised: heap vs stack lifetime; directions framed as the picture.',
  ),
  'arrays/spot_flaw/2': ok('Correct scenario.'),
  'linked_lists/spot_flaw/1': ok('Revised: prepend O(1) stated correctly; one flaw only.'),
  'binary_search_trees/spot_flaw/1': ok(),
  'hash_functions/diagnostic_mcq/2': ok(),
  'hash_tables/spot_flaw/1': ok('The L5 "always O(1)" misconception item.'),
  'tries/diagnostic_mcq/2': ok(),
}
