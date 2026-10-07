import { describe, expect, it } from 'vitest'
import type { ExtractConceptsInput, ExtractConceptsOutput } from './schema'
import { validateExtraction } from './validate'

const segments = [{ idx: 0, text: 'A pointer stores an address.' }]
const input = (targetCount: number): ExtractConceptsInput => ({
  lectureTitle: 'L',
  segments,
  existingConcepts: [],
  targetCount,
})
const concepts = (n: number): ExtractConceptsOutput => ({
  concepts: Array.from({ length: n }, (_, i) => ({
    canonicalKey: `concept-${i}`,
    name: `Concept ${i}`,
    summary: 'One grounded sentence.',
    salience: 0.5,
    segmentIdxs: [0],
    keyPoints: [
      { id: 'k1', text: 'Point one.', segmentIdxs: [0] },
      { id: 'k2', text: 'Point two.', segmentIdxs: [0] },
    ],
  })),
  edges: [],
  chapters: [],
})
const countErrors = (out: ExtractConceptsOutput, target: number) =>
  validateExtraction(out, input(target)).filter((e) => e.startsWith('concepts: expected'))

describe('validateExtraction counts (F2.2, F2.9)', () => {
  it('lets a short lecture yield one, two or zero concepts instead of padding', () => {
    expect(countErrors(concepts(0), 3)).toEqual([])
    expect(countErrors(concepts(1), 3)).toEqual([])
    expect(countErrors(concepts(2), 3)).toEqual([])
  })

  it('keeps the scaled range for longer lectures', () => {
    expect(countErrors(concepts(10), 10)).toEqual([])
    expect(countErrors(concepts(2), 10)).toEqual(['concepts: expected 8..12, got 2'])
  })
})
