import { describe, expect, it } from 'vitest'
import { canonicalKey, findCycle, isDag, validateCitations } from './graph'

describe('canonicalKey', () => {
  it.each([
    ['Linked Lists', 'linked list'],
    ['  linked-list ', 'linked list'],
    ['Hash Tables', 'hash table'],
    ['Queries', 'query'],
    ['Classes', 'class'],
    ['Big-O Notation', 'big o notation'],
    ['Binary Search Analysis', 'binary search analysis'],
    ['Status codes', 'status code'],
    ['Café  Pointers!', 'cafe pointer'],
    ['malloc()', 'malloc'],
  ])('%j → %j', (input, expected) => {
    expect(canonicalKey(input)).toBe(expected)
  })
})

describe('findCycle / isDag', () => {
  it('accepts a DAG of depends_on edges', () => {
    const edges = [
      { from: 'linked-list', to: 'pointer', relation: 'depends_on' as const },
      { from: 'pointer', to: 'memory', relation: 'depends_on' as const },
      { from: 'linked-list', to: 'memory', relation: 'depends_on' as const },
    ]
    expect(isDag(edges)).toBe(true)
    expect(findCycle(edges)).toBeNull()
  })

  it('finds a cycle', () => {
    const edges = [
      { from: 'a', to: 'b', relation: 'depends_on' as const },
      { from: 'b', to: 'c', relation: 'depends_on' as const },
      { from: 'c', to: 'a', relation: 'depends_on' as const },
    ]
    expect(findCycle(edges)).toEqual(['a', 'b', 'c', 'a'])
    expect(isDag(edges)).toBe(false)
  })

  it('treats a self-loop as a cycle', () => {
    expect(isDag([{ from: 'a', to: 'a', relation: 'depends_on' }])).toBe(false)
  })

  it('ignores cycles through other relations', () => {
    const edges = [
      { from: 'a', to: 'b', relation: 'depends_on' as const },
      { from: 'b', to: 'a', relation: 'contrasts_with' as const },
    ]
    expect(isDag(edges)).toBe(true)
  })
})

describe('validateCitations', () => {
  const existing = new Set([0, 1, 2])

  it('accepts existing citations', () => {
    expect(validateCitations([0, 2], existing)).toEqual({ valid: true, missing: [], empty: false })
  })

  it('reports missing citations once each', () => {
    expect(validateCitations([1, 7, 7, -1], existing)).toEqual({ valid: false, missing: [7, -1], empty: false })
  })

  it('rejects empty citations', () => {
    expect(validateCitations([], existing)).toEqual({ valid: false, missing: [], empty: true })
  })
})
