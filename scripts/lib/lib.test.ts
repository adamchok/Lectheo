import { describe, expect, it } from 'vitest'
import { targetCounts } from './bank'
import { csvField } from './csv'
import { seedEdges, type Extraction, type SeedEdge } from './extract'
import { clockMs } from './segments'

describe('seed-library helpers', () => {
  it('asks for 2 MCQs, 2 flaw scenarios (every other concept with a correct one) and 1 transfer', () => {
    expect(targetCounts(0)).toEqual({ mcq: 2, flawed: 1, correct: 1, transfer: 1 })
    expect(targetCounts(1)).toEqual({ mcq: 2, flawed: 2, correct: 0, transfer: 1 })
  })

  it('dedupes edges already stated by an earlier lecture and drops self-edges', () => {
    const extraction = {
      lecture: 'l5',
      edges: [
        { fromKey: 'linked_lists', toKey: 'pointers', relation: 'depends_on', segmentIdxs: [4] },
        { fromKey: 'arrays', toKey: 'arrays', relation: 'contrasts_with', segmentIdxs: [1] },
        { fromKey: 'tries', toKey: 'arrays', relation: 'depends_on', segmentIdxs: [9] },
      ],
    } as unknown as Extraction
    const earlier: SeedEdge[] = [
      { from: 'linked_lists', to: 'pointers', relation: 'depends_on', lecture: 'l4', segs: [1] },
    ]
    expect(seedEdges(extraction, earlier)).toEqual([
      { from: 'tries', to: 'arrays', relation: 'depends_on', lecture: 'l5', segs: [9] },
    ])
  })

  it('quotes CSV fields only when needed and parses clocks', () => {
    expect(csvField('plain')).toBe('plain')
    expect(csvField('a, "b"')).toBe('"a, ""b"""')
    expect(csvField(null)).toBe('')
    expect(clockMs('1:16:30')).toBe(4_590_000)
  })
})
