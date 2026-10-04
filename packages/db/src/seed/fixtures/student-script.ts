import type { ConfidenceLevel } from '@lectheo/contracts'
import type { LectureKey } from '../ids'

/**
 * What the seed student has done (Product Spec F0.3 / §4.1 judge path), expressed against
 * fixture concept keys and item variants. Times are hours before the seed base date.
 *
 * Resulting mastery (Architecture §6.2):
 * - L3: binary_search, selection_sort, bubble_sort, recursion GREEN; asymptotic_notation
 *   (unsure diagnostic + hint-assisted flaw) and merge_sort (guessed diagnostic + teach-back) AMBER.
 * - L4: pointers RED (confident mistake: sure + wrong, follow-up wrong); pass_by_reference,
 *   malloc_and_null, memory_leaks AMBER (diagnostic only); strings, stack_and_heap GRAY.
 * - L5: untouched ("Ready to watch").
 */

export interface MarkerPlan {
  lecture: LectureKey
  kind: 'lost' | 'important'
  tMs: number
  hoursAgo: number
  /** null = unlinked marker (e.g. during a demo). */
  concept: string | null
  overlap?: number
}

export interface DiagnosticAnswer {
  concept: string
  variant: number
  confidence: ConfidenceLevel
  correct: boolean
  /** The wrong option picked (required when correct = false). */
  chose?: 'a' | 'b' | 'c' | 'd'
  followUp?: boolean
}

export interface DiagnosticPlan {
  lecture: LectureKey
  hoursAgo: number
  /** In the order they were asked; follow-ups directly after the question that triggered them. */
  answers: DiagnosticAnswer[]
}

export interface TryPlan {
  answer: string
  rationale: string
  /** spot_flaw only: judge score for the correction (0–2). */
  correctionScore?: number
  /** transfer / teach_back: per-criterion scores (default 2 each). */
  scores?: number[]
  guidingQuestion?: string
}

export interface ActivityPlan {
  key: string
  type: 'spot_flaw' | 'teach_back' | 'transfer'
  concept: string
  variant?: number
  hoursAgo: number
  hintsUsed?: number
  messages: { role: 'student' | 'persona'; content: string }[]
  tries: TryPlan[]
}

const markers: MarkerPlan[] = [
  // Lecture 3, watched ~4 days ago
  {
    lecture: 'l3',
    kind: 'important',
    tMs: 4_780_000,
    hoursAgo: 99.88,
    concept: 'selection_sort',
    overlap: 0.75,
  },
  {
    lecture: 'l3',
    kind: 'important',
    tMs: 6_135_000,
    hoursAgo: 99.5,
    concept: 'recursion',
    overlap: 0.8,
  },
  {
    lecture: 'l3',
    kind: 'lost',
    tMs: 6_920_000,
    hoursAgo: 99.29,
    concept: 'merge_sort',
    overlap: 0.85,
  },
  // Lecture 4, watched ~2 days ago
  {
    lecture: 'l4',
    kind: 'important',
    tMs: 4_240_000,
    hoursAgo: 49.86,
    concept: 'malloc_and_null',
    overlap: 0.8,
  },
  {
    lecture: 'l4',
    kind: 'important',
    tMs: 4_365_000,
    hoursAgo: 49.82,
    concept: 'memory_leaks',
    overlap: 0.85,
  },
  {
    lecture: 'l4',
    kind: 'lost',
    tMs: 5_210_000,
    hoursAgo: 49.59,
    concept: 'pointers',
    overlap: 0.9,
  },
  {
    lecture: 'l4',
    kind: 'lost',
    tMs: 5_380_000,
    hoursAgo: 49.54,
    concept: 'pointers',
    overlap: 0.85,
  },
  { lecture: 'l4', kind: 'important', tMs: 5_710_000, hoursAgo: 49.45, concept: null },
  {
    lecture: 'l4',
    kind: 'lost',
    tMs: 6_320_000,
    hoursAgo: 49.28,
    concept: 'pass_by_reference',
    overlap: 0.8,
  },
]

const diagnostics: DiagnosticPlan[] = [
  {
    lecture: 'l3',
    hoursAgo: 99,
    answers: [
      // marked lost → marked important → baseline (F3.1)
      { concept: 'merge_sort', variant: 1, confidence: 'guess', correct: true },
      { concept: 'selection_sort', variant: 1, confidence: 'sure', correct: true },
      { concept: 'binary_search', variant: 1, confidence: 'sure', correct: true },
      { concept: 'asymptotic_notation', variant: 1, confidence: 'unsure', correct: true },
      { concept: 'bubble_sort', variant: 1, confidence: 'sure', correct: true },
    ],
  },
  {
    lecture: 'l4',
    hoursAgo: 26,
    answers: [
      { concept: 'pointers', variant: 1, confidence: 'sure', correct: false, chose: 'a' },
      {
        concept: 'pointers',
        variant: 2,
        confidence: 'unsure',
        correct: false,
        chose: 'a',
        followUp: true,
      },
      { concept: 'pass_by_reference', variant: 1, confidence: 'unsure', correct: true },
      { concept: 'malloc_and_null', variant: 1, confidence: 'sure', correct: true },
      { concept: 'memory_leaks', variant: 1, confidence: 'unsure', correct: true },
    ],
  },
]

const activities: ActivityPlan[] = [
  {
    key: 'l3-binary-search-flaw',
    type: 'spot_flaw',
    concept: 'binary_search',
    variant: 1,
    hoursAgo: 75,
    messages: [
      {
        role: 'student',
        content: 'What would happen if each call searched all of the doors again instead of half?',
      },
      {
        role: 'persona',
        content:
          'My search calls itself on the left or right half, and a function that calls itself stops eventually, so I did not worry much about what gets passed along.',
      },
      {
        role: 'student',
        content: 'So what actually guarantees that it reaches "no doors left"?',
      },
      {
        role: 'persona',
        content:
          'It checks whether any doors are left first, and returns false if there are none. I trusted that check to end things.',
      },
    ],
    tries: [
      {
        answer:
          "Sentence 4 is wrong. Calling itself doesn't make a function stop. It stops because every call gets a smaller problem, half the doors, so it eventually reaches the no-doors-left base case. If it passed the same doors each time it would recurse forever.",
        rationale:
          'Correct sentence and a precise fix: termination depends on each call shrinking the problem toward a base case.',
      },
    ],
  },
  {
    key: 'l3-selection-sort-flaw',
    type: 'spot_flaw',
    concept: 'selection_sort',
    variant: 1,
    hoursAgo: 74.5,
    messages: [
      { role: 'student', content: 'How does your selection sort notice that no swaps are needed?' },
      {
        role: 'persona',
        content:
          'On each pass it finds the smallest remaining value. If that value is already in the first unsorted position, there is nothing to move.',
      },
      { role: 'student', content: 'Does it ever skip scanning the remaining elements?' },
      {
        role: 'persona',
        content:
          'Each pass looks through the unsorted part to find the smallest value. That is the core of the algorithm as I wrote it.',
      },
      {
        role: 'student',
        content: 'Then what makes it stop after one pass when the input is sorted?',
      },
      {
        role: 'persona',
        content:
          'I described it as stopping once it sees that no swaps are needed, which is what makes the best case fast.',
      },
    ],
    tries: [
      {
        answer: "Sentence 4 is wrong because selection sort's best case isn't Ω(n).",
        rationale:
          'Right sentence, but the correction only restates that the claim is false; it does not say what selection sort actually does on sorted input or what its best case is.',
        correctionScore: 0,
        guidingQuestion:
          'On an already-sorted array, what does selection sort still have to do on every pass to be sure it has found the smallest remaining value?',
      },
      {
        answer:
          "Selection sort has no early exit. Even on sorted input every pass still scans all the remaining elements to confirm the minimum, so it makes about n²/2 comparisons and its best case is Ω(n²), not O(n). Stopping when there are no swaps is bubble sort's trick.",
        rationale:
          'Explains that the scan always happens on every pass and gives the correct Ω(n²) best case.',
      },
    ],
  },
  {
    key: 'l3-asymptotic-flaw',
    type: 'spot_flaw',
    concept: 'asymptotic_notation',
    variant: 1,
    hoursAgo: 74,
    hintsUsed: 1,
    messages: [
      { role: 'student', content: "Why can't you give a Θ bound for selection sort?" },
      {
        role: 'persona',
        content:
          'I compared the upper and lower bounds I worked out in the earlier sentences and concluded that a single Θ did not apply.',
      },
    ],
    tries: [
      {
        answer:
          'The last sentence is wrong: O is n² and Ω is also n², so the bounds match and selection sort is in Θ(n²).',
        rationale: 'Correct location and correction: matching O and Ω bounds give Θ(n²).',
      },
    ],
  },
  {
    key: 'l3-recursion-flaw',
    type: 'spot_flaw',
    concept: 'recursion',
    variant: 1,
    hoursAgo: 73.5,
    messages: [
      { role: 'student', content: 'What happens if draw(n) calls draw(n) instead of draw(n - 1)?' },
      {
        role: 'persona',
        content:
          'It still has the base case if (n <= 0) return, as the scenario says. I expect that to stop it either way.',
      },
    ],
    tries: [
      {
        answer:
          'Sentence 3 is wrong. The base case only helps if the calls get closer to it. draw(n) calling draw(n) never makes n smaller, so it never reaches n <= 0 and recurses forever. Each call has to pass a smaller problem, like n - 1.',
        rationale:
          'Identifies that a base case is not enough: each recursive call must shrink the input toward it.',
      },
    ],
  },
  {
    key: 'l3-recursion-teach-back',
    type: 'teach_back',
    concept: 'recursion',
    hoursAgo: 72.5,
    messages: [
      {
        role: 'persona',
        content: "Hey! Everyone keeps saying recursion like it's magic. What even is it?",
      },
      {
        role: 'student',
        content:
          'Recursion is when a function calls itself to solve a smaller version of the same problem. Like draw(n) draws a pyramid of height n by calling draw(n - 1) and then printing one more row of n bricks.',
      },
      {
        role: 'persona',
        content: "Wait, if it keeps calling itself, why doesn't it just go on forever?",
      },
      {
        role: 'student',
        content:
          'Because of the base case. draw checks if n <= 0 and just returns, and since every call has a smaller n, it eventually hits 0. Without that check it would never stop, and clang actually refuses to compile it.',
      },
      { role: 'persona', content: 'Oh okay. So is it just a fancier loop? Is there any catch?' },
      {
        role: 'student',
        content:
          "It can be more elegant, but each call uses more memory, so really deep recursion, like a pyramid of height a million, can crash where a loop wouldn't.",
      },
    ],
    tries: [
      {
        answer: '',
        rationale:
          'Covers the definition, base versus recursive case with the pyramid example, why a base case is required, and the memory cost of deep recursion.',
      },
    ],
  },
  {
    key: 'l3-bubble-sort-transfer',
    type: 'transfer',
    concept: 'bubble_sort',
    variant: 1,
    hoursAgo: 72,
    messages: [],
    tries: [
      {
        answer:
          '(a) 5 passes of 5 comparisons each, so 25. (b) With the check, the first pass makes 5 comparisons, sees no swaps and stops, so 5. (c) On a reversed list every pass swaps something, so it never quits early and still does about (n-1)² comparisons: O(n²). The check only helps on sorted or nearly sorted input.',
        rationale:
          'Counts both cases correctly and explains why the early exit leaves the worst case at O(n²).',
      },
    ],
  },
  {
    key: 'l3-merge-sort-teach-back',
    type: 'teach_back',
    concept: 'merge_sort',
    hoursAgo: 71.5,
    messages: [
      {
        role: 'persona',
        content:
          'Okay, merge sort. I saw the bars animation and it was fast, but what is it actually doing?',
      },
      {
        role: 'student',
        content:
          "Merge sort sorts the left half, sorts the right half, and then merges the two sorted halves. A list with one element is already sorted, so that's where it stops.",
      },
      {
        role: 'persona',
        content: 'Merging sounds like a lot of work though. How do you merge two lists?',
      },
      {
        role: 'student',
        content:
          'You point at the start of both sorted halves, take whichever is smaller, and move that pointer forward. You never go back, so merging n numbers takes about n steps.',
      },
      { role: 'persona', content: 'And that is really faster than bubble sort?' },
      {
        role: 'student',
        content:
          "Yes. You halve the list about log n times and each level of merging costs n steps, so it's n log n instead of n squared. The catch is that it needs extra memory to merge into.",
      },
    ],
    tries: [
      {
        answer: '',
        rationale:
          'Clear on the algorithm, linear merging, the n log n analysis and the space trade-off; does not mention that merge sort has no early exit, so sorted input still costs n log n.',
        scores: [2, 2, 2, 0, 2],
      },
    ],
  },
]

export const studentScript = { markers, diagnostics, activities }
