import { describe, expect, it } from 'vitest'
import { clipMs, learningOrder, mergeClips, readMinutes } from './study'

const dep = (from: string, to: string) => ({ from, to, relation: 'depends_on' as const })

describe('learningOrder (F9.2)', () => {
  it('puts prerequisites first and breaks ties by first appearance', () => {
    const concepts = [
      { id: 'hash', firstIdx: 2 },
      { id: 'array', firstIdx: 9 },
      { id: 'list', firstIdx: 0 },
    ]
    // hash depends on array, which appears later in the lecture.
    expect(learningOrder(concepts, [dep('hash', 'array')])).toEqual(['list', 'array', 'hash'])
  })

  it('ignores other relations and edges to concepts outside the lecture', () => {
    const concepts = [
      { id: 'b', firstIdx: 1 },
      { id: 'a', firstIdx: 0 },
    ]
    const edges = [{ from: 'a', to: 'b', relation: 'example_of' as const }, dep('a', 'elsewhere')]
    expect(learningOrder(concepts, edges)).toEqual(['a', 'b'])
  })

  it('never drops concepts, even on a cycle', () => {
    const concepts = [
      { id: 'a', firstIdx: 0 },
      { id: 'b', firstIdx: 1 },
      { id: 'c', firstIdx: 2 },
    ]
    expect(learningOrder(concepts, [dep('a', 'b'), dep('b', 'a')])).toEqual(['c', 'a', 'b'])
  })
})

describe('mergeClips (F9.3)', () => {
  const segments = [0, 1, 2, 3, 4, 5].map((idx) => ({
    idx,
    startMs: idx * 30_000,
    endMs: idx * 30_000 + 29_000,
  }))

  it('merges neighbouring segments into one range, in time order', () => {
    const clips = mergeClips(segments, [4, 1, 2, 2])
    expect(clips).toEqual([
      { startMs: 30_000, endMs: 89_000 },
      { startMs: 120_000, endMs: 149_000 },
    ])
    expect(clipMs(clips)).toBe(59_000 + 29_000)
  })

  it('skips unknown indexes', () => {
    expect(mergeClips(segments, [99])).toEqual([])
  })
})

describe('readMinutes (F9.5)', () => {
  it('is words ÷ 200, rounded up', () => {
    expect(readMinutes([])).toBe(0)
    expect(readMinutes(['one two', ' three '])).toBe(1)
    expect(readMinutes(['w '.repeat(200)])).toBe(1)
    expect(readMinutes(['w '.repeat(201)])).toBe(2)
  })
})
