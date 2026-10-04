import type { LectureKey } from '@lectheo/db/seed'

/**
 * The CS50x 2026 library curriculum (Product Spec F7.1–F7.2): which lectures, which core window of
 * each, and which concepts each lecture introduces. Concept keys are the seed's snake_case keys
 * (seed ids are UUIDv5 of them, so they must never change); the model grounds, summarises and links
 * these concepts in the real subtitles but does not rename or add introduced concepts, which keeps
 * ids, the sample student and the L5 diagnostic size (6 introduced → 4 questions) stable.
 *
 * Windows are video/MP3 time and were checked against the official .srt and the YouTube chapter
 * list (5 Oct 2026):
 * - L3 1:12:30–1:57:30 (45:00): from "formalize what the volunteers did" (selection sort, chapter
 *   1:12:20) through bubble sort, recursion, iteration.c/recursion.c, merge sort; ends as the sort
 *   race starts (1:57:23). Unchanged.
 * - L4 1:02:30–1:47:30 (45:00, was 1:02:00–1:48:30 = 46:30, over the 45-min cap): from "malloc(4)"
 *   through strlen + 1, copying, free/Valgrind, garbage values, Binky, swap by value vs by
 *   reference, ending on "we have now mutated the actual values of x and y".
 * - L5 1:16:30–2:01:30 (45:00, was 1:18:54–2:02:54 in HLS-subtitle time): the old fixture used
 *   hls/subtitles/en/en.vtt time, which runs 2:24 ahead of the YouTube video/MP3 by Trees (HLS
 *   tries 1:56:15 vs chapter 1:53:51). The lecture5.srt is the livestream: video time = srt − 1:00:00
 *   throughout (trees 2:22:19 → 1:22:19, chapter 1:22:04; last cue 3:03:16 → 2:03:16 of 2:03:50).
 *   Same content as before: linked-list O(n) recap → trees/BSTs → hashing/hash tables → tries.
 */

export interface ConceptPlan {
  readonly key: string
  readonly name: string
}

export interface LecturePlan {
  readonly key: LectureKey
  readonly seq: number
  readonly title: string
  readonly youtubeId: string
  readonly srtUrl: string
  /** Subtract from .srt times to get video time (L5's .srt is the livestream). */
  readonly srtOffset: string
  readonly start: string
  readonly end: string
  /** Full video length (YouTube lengthSeconds). */
  readonly duration: string
  readonly fallbackAudioUrl: string
  readonly windowNote: string
  readonly concepts: readonly ConceptPlan[]
  /**
   * depends_on links this lecture must state (F7.2 cross-lecture chain); keys may belong to
   * earlier lectures. Checked after extraction.
   */
  readonly requiredEdges: readonly (readonly [from: string, to: string])[]
}

const cdn = (n: number) => `https://cdn.cs50.net/2025/fall/lectures/${n}`

export const CURRICULUM: readonly LecturePlan[] = [
  {
    key: 'l3',
    seq: 3,
    title: 'Lecture 3: Algorithms',
    youtubeId: '6Svu_ae5ebk',
    srtUrl: `${cdn(3)}/lang/en/lecture3.srt`,
    srtOffset: '0:00:00',
    start: '1:12:30',
    end: '1:57:30',
    duration: '1:59:35',
    fallbackAudioUrl: `${cdn(3)}/lecture3.mp3`,
    windowNote:
      'Selection sort (chapter 1:12:20) → bubble sort → recursion → merge sort; ends as the sort race starts (1:57:23).',
    concepts: [
      { key: 'binary_search', name: 'Binary search' },
      { key: 'asymptotic_notation', name: 'Big O, Ω and Θ' },
      { key: 'selection_sort', name: 'Selection sort' },
      { key: 'bubble_sort', name: 'Bubble sort' },
      { key: 'recursion', name: 'Recursion' },
      { key: 'merge_sort', name: 'Merge sort' },
    ],
    requiredEdges: [['merge_sort', 'recursion']],
  },
  {
    key: 'l4',
    seq: 4,
    title: 'Lecture 4: Memory',
    youtubeId: 'db0H0U13YsA',
    srtUrl: `${cdn(4)}/lang/en/lecture4.srt`,
    srtOffset: '0:00:00',
    start: '1:02:30',
    end: '1:47:30',
    duration: '2:19:54',
    fallbackAudioUrl: `${cdn(4)}/lecture4.mp3`,
    windowNote:
      'malloc(4) and strlen + 1 → copying strings → free/Valgrind → garbage values → Binky → swap by value vs by reference (chapters 0:57:11–1:48:14), capped at 45 min.',
    concepts: [
      { key: 'strings_as_char_pointers', name: 'Strings as char *' },
      { key: 'malloc_and_null', name: 'malloc and NULL checks' },
      { key: 'memory_leaks', name: 'free, memory leaks and Valgrind' },
      { key: 'pointers', name: 'Pointers and dereferencing' },
      { key: 'pass_by_reference', name: 'Passing by value vs. by reference (swap)' },
      { key: 'stack_and_heap', name: 'Stack and heap' },
    ],
    requiredEdges: [['pass_by_reference', 'pointers']],
  },
  {
    key: 'l5',
    seq: 5,
    title: 'Lecture 5: Data Structures',
    youtubeId: 'PmAI76OGE_E',
    srtUrl: `${cdn(5)}/lang/en/lecture5.srt`,
    srtOffset: '1:00:00',
    start: '1:16:30',
    end: '2:01:30',
    duration: '2:03:50',
    fallbackAudioUrl: `${cdn(5)}/lecture5.mp3`,
    windowNote:
      'Linked-list O(n) recap → trees and BSTs (chapter 1:22:04) → hashing and hash tables (1:36:47) → tries (1:53:51). Video time = lecture5.srt − 1:00:00.',
    concepts: [
      { key: 'arrays', name: 'Arrays: contiguity and resizing cost' },
      { key: 'linked_lists', name: 'Linked lists' },
      { key: 'binary_search_trees', name: 'Binary search trees' },
      { key: 'hash_functions', name: 'Hash functions' },
      { key: 'hash_tables', name: 'Hash tables' },
      { key: 'tries', name: 'Tries' },
    ],
    requiredEdges: [
      ['pointers', 'arrays'],
      ['linked_lists', 'pointers'],
      ['hash_tables', 'linked_lists'],
      ['binary_search', 'arrays'],
    ],
  },
]

/** Seed keys are snake_case; the extract-concepts task speaks kebab-case. */
export const toKebab = (key: string): string => key.replace(/_/g, '-')
export const toSnake = (key: string): string => key.replace(/-/g, '_')

export const lecturePlan = (key: LectureKey): LecturePlan => {
  const plan = CURRICULUM.find((l) => l.key === key)
  if (!plan) throw new Error(`unknown lecture ${key}`)
  return plan
}

/** Per-concept requirements added to the draft prompt (F7.3 classic misconception). */
export const DRAFT_DIRECTIVES: Readonly<Record<string, string>> = {
  hash_tables: [
    'Classic misconception (required): one diagnostic MCQ must have a distractor whose',
    'misconception text is exactly "Hash table lookup is always O(1)", and one spot-flaw',
    'scenario must be flawed with the flawed sentence claiming that a hash table lookup',
    '"always takes O(1)" time (the correction: collisions make chains, so the worst case is O(n)).',
  ].join(' '),
}
