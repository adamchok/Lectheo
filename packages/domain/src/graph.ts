import type { Relation } from '@lectheo/contracts'

/** Words shorter than this are never singularized ("bus", "gas", "is"). */
const MIN_SINGULARIZE_LENGTH = 4
/** Endings that look plural but are not ("analysis", "status", "class"). */
const NON_PLURAL_ENDINGS = /(?:ss|us|is)$/

/**
 * Simple English singularization for concept keys: "lists" → "list", "queries" → "query",
 * "classes" → "class", "hashes" → "hash", "indexes" → "index". Deliberately conservative.
 */
function singularize(word: string): string {
  if (word.length < MIN_SINGULARIZE_LENGTH || NON_PLURAL_ENDINGS.test(word)) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

/**
 * Normalized concept name for dedupe (`concepts.canonical_key`, F2.7, Architecture §4.3
 * validateGraph): strip diacritics, lowercase, punctuation → space, collapse spaces, singularize
 * each word. "Linked Lists" and "linked-list" both give "linked list".
 */
export function canonicalKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0)
    .map(singularize)
    .join(' ')
}

export interface GraphEdge {
  readonly from: string
  readonly to: string
  readonly relation: Relation
}

/**
 * Finds a cycle among `depends_on` edges (Data Model invariant 5: they form a DAG).
 * Returns the node ids along the cycle with the start repeated at the end
 * (e.g. `['a', 'b', 'a']`), or null. Other relations are ignored.
 */
export function findCycle(edges: readonly GraphEdge[]): string[] | null {
  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    if (e.relation !== 'depends_on') continue
    adjacency.set(e.from, [...(adjacency.get(e.from) ?? []), e.to])
  }

  const done = new Set<string>()
  const onPath = new Map<string, number>()
  const path: string[] = []

  const visit = (node: string): string[] | null => {
    const pathPos = onPath.get(node)
    if (pathPos !== undefined) return [...path.slice(pathPos), node]
    if (done.has(node)) return null
    onPath.set(node, path.length)
    path.push(node)
    for (const next of adjacency.get(node) ?? []) {
      const cycle = visit(next)
      if (cycle) return cycle
    }
    path.pop()
    onPath.delete(node)
    done.add(node)
    return null
  }

  for (const node of adjacency.keys()) {
    const cycle = visit(node)
    if (cycle) return cycle
  }
  return null
}

/** True when the `depends_on` edges form a DAG (self-loops count as cycles). */
export function isDag(edges: readonly GraphEdge[]): boolean {
  return findCycle(edges) === null
}

export interface CitationCheck {
  readonly valid: boolean
  /** Cited indexes that don't exist in the lecture (deduplicated, in citation order). */
  readonly missing: readonly number[]
  /** True when nothing was cited (every concept/edge/item must cite ≥ 1 segment). */
  readonly empty: boolean
}

/**
 * Checks that model citations point at existing segments (Data Model invariant 2, Architecture
 * §4.3 validateGraph "citations exist"). Non-integer or negative indexes count as missing.
 */
export function validateCitations(
  segmentIdxs: readonly number[],
  existingIdxs: ReadonlySet<number>,
): CitationCheck {
  const missing = [...new Set(segmentIdxs.filter((idx) => !existingIdxs.has(idx)))]
  const empty = segmentIdxs.length === 0
  return { valid: !empty && missing.length === 0, missing, empty }
}
