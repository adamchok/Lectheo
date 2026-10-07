import { firstIdxs } from '../common'
import type { ExtractConceptsInput, ExtractConceptsOutput } from './schema'

const CS50_CONCEPTS = [
  ['pointer', 'Pointer', 'A pointer is a variable that stores the memory address of a value.'],
  ['malloc', 'malloc', 'malloc requests a block of heap memory and returns its address.'],
  ['free', 'free', 'free returns heap memory obtained with malloc to the system.'],
  ['linked-list', 'Linked list', 'A linked list chains nodes together with pointers.'],
  ['hash-table', 'Hash table', 'A hash table maps keys to buckets using a hash function.'],
  ['binary-search', 'Binary search', 'Binary search halves a sorted array each step.'],
  ['big-o', 'Big O notation', 'Big O describes an upper bound on running time as n grows.'],
  ['trie', 'Trie', 'A trie stores keys character by character in a tree of arrays.'],
] as const

export function fakeExtractConcepts(input: ExtractConceptsInput): ExtractConceptsOutput {
  const idxs = firstIdxs(input.segments, 2)
  const count = Math.min(Math.max(input.targetCount, 3), CS50_CONCEPTS.length)
  const concepts = CS50_CONCEPTS.slice(0, count).map(([canonicalKey, name, summary], i) => ({
    canonicalKey,
    name,
    summary,
    salience: Number((1 - i / (count + 1)).toFixed(2)),
    segmentIdxs: idxs,
    keyPoints: [
      { id: 'k1', text: summary, segmentIdxs: idxs },
      { id: 'k2', text: `${name} is used in CS50 problem sets written in C.`, segmentIdxs: idxs },
    ],
  }))
  const edges = concepts.slice(1).map((c, i) => ({
    fromKey: c.canonicalKey,
    toKey: concepts[i]?.canonicalKey ?? 'pointer',
    relation: 'depends_on' as const,
    segmentIdxs: idxs,
  }))
  return {
    concepts,
    edges,
    chapters: fakeChapters(
      input,
      concepts.map((c) => c.canonicalKey),
    ),
  }
}

/**
 * Evenly spaced chapters in the middle of the asked range; concepts round-robin over all but the
 * last chapter, a "Recap" without concepts (so chapters without marks are covered too).
 */
function fakeChapters(input: ExtractConceptsInput, keys: readonly string[]) {
  const count = input.chapterCount
  if (!count || input.segments.length === 0) return []
  const n = Math.min(input.segments.length, Math.round((count.min + count.max) / 2))
  const teaching = Math.max(1, n - 1)
  return Array.from({ length: n }, (_, i) => {
    const recap = n > 1 && i === n - 1
    return {
      title: recap ? 'Recap' : `Part ${i + 1}`,
      summary: recap ? 'A quick recap of the lecture.' : `Part ${i + 1} of the lecture.`,
      startIdx: input.segments[Math.floor((i * input.segments.length) / n)]?.idx ?? 0,
      conceptKeys: recap ? [] : keys.filter((_, k) => k % teaching === i),
    }
  })
}
