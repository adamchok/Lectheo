import type { CourseAttributionJson } from '@lectheo/contracts'
import type { EdgeFx, ExtraOccurrenceFx } from './types'

export const LIBRARY_COURSE_TITLE = 'CS50x 2026'

export const LIBRARY_ATTRIBUTION: CourseAttributionJson = {
  source: 'CS50x 2026 by Harvard University',
  license: 'CC BY-NC-SA 4.0',
  url: 'https://cs50.harvard.edu/x/license/',
  adaptedBy: 'Lectheo',
}

/**
 * Concept edges (F7.2). `from depends_on to` = "to is a prerequisite of from"; depends_on forms a
 * DAG (Data Model invariant 5). Segment idxs refer to `lecture`, where the link is stated.
 * Cross-lecture chain: arrays → pointers → linked lists → hash tables.
 */
export const EDGES: EdgeFx[] = [
  // Lecture 3
  { from: 'binary_search', relation: 'example_of', to: 'recursion', lecture: 'l3', segs: [21, 24] },
  { from: 'merge_sort', relation: 'depends_on', to: 'recursion', lecture: 'l3', segs: [30, 31] },
  {
    from: 'selection_sort',
    relation: 'depends_on',
    to: 'asymptotic_notation',
    lecture: 'l3',
    segs: [6, 7],
  },
  {
    from: 'bubble_sort',
    relation: 'depends_on',
    to: 'asymptotic_notation',
    lecture: 'l3',
    segs: [14, 17],
  },
  {
    from: 'bubble_sort',
    relation: 'contrasts_with',
    to: 'selection_sort',
    lecture: 'l3',
    segs: [8, 16],
  },
  {
    from: 'merge_sort',
    relation: 'contrasts_with',
    to: 'bubble_sort',
    lecture: 'l3',
    segs: [30, 39],
  },
  // Lecture 4
  { from: 'pointers', relation: 'depends_on', to: 'arrays', lecture: 'l4', segs: [19] },
  {
    from: 'strings_as_char_pointers',
    relation: 'depends_on',
    to: 'pointers',
    lecture: 'l4',
    segs: [0],
  },
  { from: 'malloc_and_null', relation: 'depends_on', to: 'pointers', lecture: 'l4', segs: [1] },
  {
    from: 'malloc_and_null',
    relation: 'depends_on',
    to: 'stack_and_heap',
    lecture: 'l4',
    segs: [31],
  },
  {
    from: 'memory_leaks',
    relation: 'depends_on',
    to: 'malloc_and_null',
    lecture: 'l4',
    segs: [11, 13],
  },
  {
    from: 'pass_by_reference',
    relation: 'depends_on',
    to: 'pointers',
    lecture: 'l4',
    segs: [35, 36],
  },
  {
    from: 'pass_by_reference',
    relation: 'depends_on',
    to: 'stack_and_heap',
    lecture: 'l4',
    segs: [33],
  },
  // Lecture 5
  { from: 'linked_lists', relation: 'depends_on', to: 'pointers', lecture: 'l5', segs: [4] },
  { from: 'linked_lists', relation: 'contrasts_with', to: 'arrays', lecture: 'l5', segs: [2, 3] },
  { from: 'binary_search', relation: 'depends_on', to: 'arrays', lecture: 'l5', segs: [1, 2] },
  {
    from: 'binary_search_trees',
    relation: 'depends_on',
    to: 'binary_search',
    lecture: 'l5',
    segs: [8],
  },
  {
    from: 'binary_search_trees',
    relation: 'depends_on',
    to: 'pointers',
    lecture: 'l5',
    segs: [10],
  },
  {
    from: 'binary_search_trees',
    relation: 'depends_on',
    to: 'recursion',
    lecture: 'l5',
    segs: [12, 16],
  },
  {
    from: 'binary_search_trees',
    relation: 'contrasts_with',
    to: 'linked_lists',
    lecture: 'l5',
    segs: [17, 18],
  },
  { from: 'hash_tables', relation: 'depends_on', to: 'arrays', lecture: 'l5', segs: [25] },
  {
    from: 'hash_tables',
    relation: 'depends_on',
    to: 'linked_lists',
    lecture: 'l5',
    segs: [25, 28],
  },
  {
    from: 'hash_tables',
    relation: 'depends_on',
    to: 'hash_functions',
    lecture: 'l5',
    segs: [21, 26],
  },
  { from: 'tries', relation: 'depends_on', to: 'arrays', lecture: 'l5', segs: [33, 34] },
  { from: 'tries', relation: 'contrasts_with', to: 'hash_tables', lecture: 'l5', segs: [39] },
]

/** Concepts revisited in a later lecture (concept_occurrences beyond their first lecture). */
export const EXTRA_OCCURRENCES: ExtraOccurrenceFx[] = [
  { concept: 'binary_search', lecture: 'l5', segs: [2, 5, 8], salience: 0.4 },
  { concept: 'recursion', lecture: 'l5', segs: [12, 15, 16], salience: 0.3 },
  { concept: 'pointers', lecture: 'l5', segs: [4, 10, 25], salience: 0.4 },
  { concept: 'asymptotic_notation', lecture: 'l5', segs: [13, 19, 32], salience: 0.3 },
  { concept: 'malloc_and_null', lecture: 'l5', segs: [2, 3], salience: 0.2 },
]
