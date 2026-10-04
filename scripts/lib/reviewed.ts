import type { ItemFx, LectureKey } from '@lectheo/db/seed'
import type { SeedEdge } from './extract'

/*
 * Reviewed corrections on top of the generated bank (PR #10 review). Everything here is applied
 * by scripts/seed-library.ts at emit time, so the generated stages stay cached and every human
 * change is in one reviewable file:
 * - TRANSCRIPT_FIXES: ASR errors in the official subtitles (segment text only, timestamps kept).
 * - CONCEPT_FIXES: summary / key point text the model got wrong (key points grade teach-back).
 * - EXTRA_EDGES: links the extraction dropped (citations checked by hand).
 * - REVISIONS: items redrafted in place (same concept/kind/variant, so the same id) through the
 *   normal draft → blind verify → at most one redraft loop, with the reviewer's note.
 */

export interface TranscriptFix {
  lecture: LectureKey
  /** Only segments with idx ≥ this (e.g. "try" means trie only in L5's tries section). */
  fromIdx?: number
  pattern: RegExp
  to: string
}

const all = (pattern: RegExp, to: string): TranscriptFix[] =>
  (['l3', 'l4', 'l5'] as const).map((lecture) => ({ lecture, pattern, to }))

export const TRANSCRIPT_FIXES: readonly TranscriptFix[] = [
  ...all(/\b(?:Malloch|Mallock|Malock|Mao)\b/g, 'malloc'),
  ...all(/\b(?:mount )?(?:Realo|reallock|reo)\b/g, 'realloc'),
  ...all(/\bMaine\b/g, 'main'),
  ...all(/\b(?:Sterling|Stirling)\b/g, 'strlen'),
  ...all(/\b(?:Stir Copy|stircopy)\b/g, 'strcpy'),
  ...all(/\bStanlib\b/g, 'stdlib'),
  ...all(/\bGetstring\b/g, 'get_string'),
  ...all(/\bValgrin\b/g, 'Valgrind'),
  ...all(/\bOX ?(\d+)/g, '0x$1'),
  ...all(/\bBinki\b/g, 'Binky'),
  ...all(/\bD referencing\b/g, 'dereferencing'),
  ...all(/\bde-referenc(e|ing)\b/g, 'dereferenc$1'),
  { lecture: 'l3', pattern: /\bn2 1 and the same\b/g, to: 'n², one and the same' },
  { lecture: 'l3', pattern: /\b[Nn]2d?\b/g, to: 'n²' },
  { lecture: 'l3', pattern: /\bbig events was\b/g, to: 'big O, was' },
  { lecture: 'l3', pattern: /\bBobble So\b/g, to: 'bubble sort' },
  { lecture: 'l3', pattern: /\bselection So\b/g, to: 'selection sort' },
  { lecture: 'l4', pattern: /\ban ant\b/g, to: 'an int' },
  { lecture: 'l4', pattern: /\bfor into i\b/g, to: 'for int i' },
  { lecture: 'l4', pattern: /\bT4 equals singles\b/g, to: "t[4] equals '\\0'" },
  { lecture: 'l4', pattern: /\b2 upper\b/g, to: 'toupper' },
  { lecture: 'l4', pattern: /\bEscopy\b/g, to: './copy' },
  { lecture: 'l4', pattern: /\bmalloc Online 8\b/g, to: 'malloc on line 8' },
  { lecture: 'l5', pattern: /They go of Say a lot, big of\./g, to: 'Big O of n.' },
  { lecture: 'l5', pattern: /\b[Bb]ig old event\b/g, to: 'big O of n' },
  { lecture: 'l5', pattern: /\bbig O of ends\b/g, to: 'big O of n' },
  { lecture: 'l5', pattern: /\bdamn it\b/g, to: 'darn it' },
  { lecture: 'l5', pattern: /\? big O of n\b/g, to: '? Big O of n' },
  { lecture: 'l5', pattern: /\bbig O of login\b/g, to: 'big O of log n' },
  { lecture: 'l5', pattern: /\bof log and\b/g, to: 'of log n' },
  { lecture: 'l5', pattern: /\b(?:Linklis|link lists)\b/g, to: 'linked lists' },
  { lecture: 'l5', pattern: /\bof end\b/g, to: 'of n' },
  { lecture: 'l5', pattern: /\bthe rays\b/g, to: 'arrays' },
  { lecture: 'l5', pattern: /\bcues\b/g, to: 'queues' },
  { lecture: 'l5', pattern: /\bAsky\b/g, to: 'ASCII' },
  { lecture: 'l5', fromIdx: 60, pattern: /\btry\b/g, to: 'trie' },
]

export function fixTranscript(lecture: LectureKey, idx: number, text: string): string {
  return TRANSCRIPT_FIXES.filter((f) => f.lecture === lecture && idx >= (f.fromIdx ?? 0)).reduce(
    (out, f) => out.replace(f.pattern, f.to),
    text,
  )
}

export interface ConceptFix {
  summary?: string
  /** key point id → corrected text (citations unchanged). */
  keyPoints?: Readonly<Record<string, string>>
}

export const CONCEPT_FIXES: Readonly<Record<string, ConceptFix>> = {
  linked_lists: {
    summary:
      'Linked lists allocate a node per value and connect the nodes with pointers, so they can grow and shrink without copying; searching, deleting and inserting in sorted order are O(n), while prepending a node is O(1).',
    keyPoints: {
      k2: 'Search and delete are O(n), and so is inserting into a sorted list (finding the spot is linear); prepending a node to an unsorted list is O(1).',
    },
  },
  binary_search_trees: {
    keyPoints: {
      k2: 'Each node stores a number and two pointers, so a tree uses considerably more memory than an array of the same values (an int plus two pointers per value).',
    },
  },
}

/** Links lost against the previous fixture, cited where the lecture relies on them. */
export const EXTRA_EDGES: readonly SeedEdge[] = [
  // t = malloc(...) leaves t "pointing to this chunk": a string is a char * to its first char.
  {
    from: 'strings_as_char_pointers',
    relation: 'depends_on',
    to: 'pointers',
    lecture: 'l4',
    segs: [7],
  },
  // "we need two pointers instead of 1": left and right child pointers.
  {
    from: 'binary_search_trees',
    relation: 'depends_on',
    to: 'pointers',
    lecture: 'l5',
    segs: [14, 23],
  },
]

export interface Revision {
  /** concept/kind/variant of the item to replace (or to fill, for a shortfall slot). */
  item: string
  note: string
  /** Bump to redraft an already revised item again (new cache key, new note). */
  round?: number
}

export const REVISIONS: readonly Revision[] = [
  {
    item: 'hash_tables/diagnostic_mcq/1',
    note: 'Option "O(26n)" is the same class as O(n), so the item had two defensible answers. No option may be asymptotically equal to the key; use e.g. "O(26), because there are only 26 buckets to check" as a distractor. The explanation must add: real hash tables grow the number of buckets with n to keep O(1) on average; with a fixed 26 buckets, chains grow with n.',
  },
  {
    item: 'hash_tables/diagnostic_mcq/2',
    note: 'Make this a lookup-cost question (it is the diagnostic follow-up), e.g. the worst-case lookup when every stored name starts with M.',
  },
  {
    item: 'linked_lists/diagnostic_mcq/2',
    round: 2,
    note: 'Variant 1 already asks why a sorted linked list loses O(log n) binary search, and so did the previous version of this item. Test a different idea: prepending is O(1) but appending without a tail pointer is O(n), or nodes scattered in memory vs a contiguous array. Never claim linked-list insertion is always O(n). Every option must be a coherent, complete statement.',
  },
  {
    item: 'linked_lists/spot_flaw/1',
    note: 'The previous version also claimed "insert is O(n)" in a non-flawed sentence, which is a second candidate flaw. Every non-flawed sentence must be fully true: prepending to a linked list is O(1); inserting in sorted order, search and delete are O(n).',
  },
  {
    item: 'linked_lists/spot_flaw/2',
    round: 2,
    note: 'Spot-flaw variant 1 already plants "binary search works on a sorted linked list". Plant a different flaw: e.g. appending to a list without a tail pointer is O(1), or nodes must be contiguous in memory like an array. Every non-flawed sentence must be fully true: prepending is O(1); inserting in sorted order, search and delete are O(n).',
  },
  {
    item: 'bubble_sort/diagnostic_mcq/2',
    note: 'Variant 1 and a flaw item already test the n−2 loop bound. Test something else: the early exit (best case Ω(n) on sorted input when a pass makes no swaps, worst case still O(n²)) or what each pass guarantees.',
  },
  {
    item: 'hash_functions/transfer/1',
    note: 'Pin the input domain explicitly (e.g. "names whose first letter is A–Z") and every edge case, so the problem has exactly one reading: the verifier rejected earlier drafts for an unspecified domain and for one-letter words.',
  },
  {
    item: 'stack_and_heap/diagnostic_mcq/1',
    note: '"The heap grows downward" is only true in the lecture\'s drawing; in address terms the heap grows upward. Anchor the stem to the lecture\'s memory picture (machine code at the top, heap below it, stack at the bottom) or avoid direction entirely.',
  },
  {
    item: 'stack_and_heap/spot_flaw/2',
    note: 'Spot-flaw variant 1 already plants "the frame is zeroed on return". Plant a different flaw, about heap vs stack lifetime (e.g. malloc\'d memory disappearing when the function returns, or a local array outliving its frame).',
  },
  {
    item: 'binary_search/diagnostic_mcq/2',
    note: 'All binary_search items tested recursion termination. Test the sorted-input precondition or why halving gives O(log n), not termination.',
  },
  {
    item: 'binary_search/spot_flaw/2',
    note: 'All binary_search items tested recursion termination. Make this (fully correct) scenario about halving the search space giving O(log n) and needing sorted input, not termination.',
  },
  {
    item: 'recursion/diagnostic_mcq/1',
    note: 'clang\'s -Winfinite-recursion is a warning; it is an error only under CS50\'s make (-Werror). Say "compiled with make in CS50\'s environment", or key on "a warning, then a crash when the stack runs out".',
  },
  {
    item: 'binary_search_trees/spot_flaw/2',
    note: 'The previous (fully correct) scenario said a node takes "roughly three times as much memory": on 64-bit an int plus two pointers is about 5×. Say "considerably more memory (an int plus two pointers per value)" or avoid a ratio.',
  },
  {
    item: 'binary_search_trees/diagnostic_mcq/2',
    note: 'Option "search both subtrees" still returns the right result, so it was a second defensible answer. Every distractor must give a wrong result or a wrong cost claim.',
  },
  {
    item: 'memory_leaks/diagnostic_mcq/1',
    note: "Make this about a memory leak (malloc without free, what Valgrind's leak summary reports), not an invalid write.",
  },
  {
    item: 'malloc_and_null/diagnostic_mcq/1',
    note: 'Replace the NULL vs NUL definition question with an applied one (F3.2): e.g. what a program must do after malloc returns NULL, and why.',
  },
]

/**
 * Literal corrections to a generated item that need no redraft (same id, checked by hand): a typo
 * in a model solution, a leak keyword that matches ordinary scenario words.
 */
export const ITEM_FIXES: Readonly<Record<string, (item: ItemFx) => ItemFx>> = {
  // The prompt has parts (a)–(d); the model solution labelled the last one "(e)".
  'hash_functions/transfer/1': (item) =>
    item.kind === 'transfer'
      ? {
          ...item,
          answerKey: {
            ...item.answerKey,
            modelSolution: item.answerKey.modelSolution.replace('(e) Hashing', '(d) Hashing'),
          },
        }
      : item,
  // Whole-word "free" blocks ordinary author replies to a scenario that says "freed".
  'stack_and_heap/spot_flaw/2': (item) => ({
    ...item,
    leakKeywords: item.leakKeywords.map((k) => (k === 'free' ? 'must be freed' : k)),
  }),
}

/** The concept's summary and key points with CONCEPT_FIXES applied (ids and citations kept). */
export function fixConcept<K extends { id: string; text: string }>(
  key: string,
  summary: string,
  keyPoints: readonly K[],
): { summary: string; keyPoints: K[] } {
  const fix = CONCEPT_FIXES[key]
  return {
    summary: fix?.summary ?? summary,
    keyPoints: keyPoints.map((k) => ({ ...k, text: fix?.keyPoints?.[k.id] ?? k.text })),
  }
}
