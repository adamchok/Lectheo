import { describe, expect, it } from 'vitest'
import {
  diagnosticCoverage,
  evenSpread,
  homeChapterIndex,
  MAX_REST_ITEMS,
  NO_FLAGS_NOTE,
  planDiagnostic,
  planRestRound,
} from './diagnostic-plan'

const concept = (conceptId: string, lostCount = 0, importantCount = 0) => ({ conceptId, lostCount, importantCount })
const items = (conceptId: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ itemId: `${conceptId}-${i + 1}`, conceptId }))

describe('planDiagnostic (F3.1)', () => {
  it('picks lost → important → baseline concepts, one item each first', () => {
    // Arrange
    const concepts = [concept('base'), concept('imp', 0, 1), concept('lost1', 1), concept('lost3', 3)]
    const pool = [...items('base', 2), ...items('imp', 2), ...items('lost1', 2), ...items('lost3', 2)]
    // Act
    const plan = planDiagnostic(concepts, pool, 5)
    // Assert
    expect(plan.itemIds).toEqual(['lost3-1', 'lost1-1', 'imp-1', 'base-1', 'lost3-2'])
    expect(plan.note).toBeUndefined()
  })

  it('uses baseline concepts with a note when there are no markers (§9)', () => {
    const plan = planDiagnostic([concept('a'), concept('b'), concept('c')], [...items('a', 1), ...items('b', 1), ...items('c', 1)], 3)
    expect(plan).toEqual({ itemIds: ['a-1', 'b-1', 'c-1'], note: NO_FLAGS_NOTE })
  })

  it('runs shorter and says so with fewer than 3 verified items (F3.7)', () => {
    const plan = planDiagnostic([concept('a', 1), concept('b')], items('a', 2), 4)
    expect(plan.itemIds).toEqual(['a-1', 'a-2'])
    expect(plan.note).toBe('Only 2 verified questions are ready, so this check is shorter than usual.')
  })

  it('combines both notes and handles zero items', () => {
    const plan = planDiagnostic([concept('a')], [], 3)
    expect(plan.itemIds).toEqual([])
    expect(plan.note).toBe(`${NO_FLAGS_NOTE} No verified questions are ready for this lecture yet.`)
  })

  it('ignores items for unknown concepts', () => {
    const plan = planDiagnostic([concept('a', 1)], [...items('x', 3), ...items('a', 3)], 3)
    expect(plan.itemIds).toEqual(['a-1', 'a-2', 'a-3'])
  })
})

const inChapter = (conceptId: string, chapterIndex: number, lostCount = 0) => ({
  ...concept(conceptId, lostCount),
  chapterIndex,
})
const oneEach = (...ids: string[]) => ids.flatMap((id) => items(id, 2))

describe('planDiagnostic baseline spread (F3.9)', () => {
  it('takes baseline concepts one per chapter in turn, learning order inside', () => {
    const concepts = [inChapter('a1', 0), inChapter('a2', 0), inChapter('b1', 1), inChapter('c1', 2)]
    const plan = planDiagnostic(concepts, oneEach('a1', 'a2', 'b1', 'c1'), 4)
    expect(plan.itemIds).toEqual(['a1-1', 'b1-1', 'c1-1', 'a2-1'])
  })

  it('keeps marked concepts first, then spreads the baseline', () => {
    const concepts = [inChapter('a1', 0), inChapter('a2', 0), inChapter('b1', 1, 2), inChapter('c1', 2)]
    const plan = planDiagnostic(concepts, oneEach('a1', 'a2', 'b1', 'c1'), 3)
    expect(plan.itemIds).toEqual(['b1-1', 'a1-1', 'c1-1'])
  })

  it('spreads evenly when there are more chapters than slots', () => {
    const concepts = Array.from({ length: 10 }, (_, i) => inChapter(`c${i}`, i))
    const plan = planDiagnostic(concepts, oneEach(...concepts.map((c) => c.conceptId)), 3)
    expect(plan.itemIds).toEqual(['c1-1', 'c5-1', 'c8-1'])
  })

  it('spreads through lecture order without chapters (not the first N)', () => {
    const concepts = Array.from({ length: 9 }, (_, i) => concept(`c${i}`))
    const plan = planDiagnostic(concepts, oneEach(...concepts.map((c) => c.conceptId)), 3)
    expect(plan.itemIds).toEqual(['c1-1', 'c4-1', 'c7-1'])
  })

  it('skips concepts with no items when spreading', () => {
    const concepts = [inChapter('a1', 0), inChapter('a2', 0), inChapter('b1', 1)]
    const plan = planDiagnostic(concepts, oneEach('a2', 'b1'), 2)
    expect(plan.itemIds).toEqual(['a2-1', 'b1-1'])
  })
})

describe('evenSpread', () => {
  it('returns every index when k ≥ n, else k spread indices', () => {
    expect(evenSpread(3, 5)).toEqual([0, 1, 2])
    expect(evenSpread(10, 3)).toEqual([1, 5, 8])
    expect(evenSpread(4, 0)).toEqual([])
  })
})

const rest = (conceptId: string, chapterIndex: number | null, tested = false) => ({
  conceptId,
  chapterIndex,
  tested,
})

describe('planRestRound (F3.10)', () => {
  it('asks one unseen item per untested concept, in chapter order', () => {
    const concepts = [rest('b', 1), rest('a', 0, true), rest('c', 0), rest('d', 2)]
    expect(planRestRound(concepts, oneEach('a', 'b', 'c', 'd'))).toEqual(['c-1', 'b-1', 'd-1'])
  })

  it('skips concepts with no question and stops at the max', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `c${i}`)
    const plan = planRestRound(
      ids.map((id) => rest(id, null)),
      oneEach(...ids.filter((id) => id !== 'c0')),
    )
    expect(plan).toHaveLength(MAX_REST_ITEMS)
    expect(plan[0]).toBe('c1-1')
  })

  it('returns nothing when everything is tested', () => {
    expect(planRestRound([rest('a', 0, true)], oneEach('a'))).toEqual([])
  })
})

describe('diagnosticCoverage (F3.10–F3.11)', () => {
  it('puts every concept in one bucket, per chapter', () => {
    const coverage = diagnosticCoverage([
      { ...rest('a', 0, true), hasQuestion: true },
      { ...rest('b', 0), hasQuestion: true },
      { ...rest('c', 1), hasQuestion: false },
      { ...rest('d', 1, true), hasQuestion: false },
      { ...rest('e', 1), hasQuestion: true },
    ])
    expect(coverage).toEqual({
      tested: 2,
      total: 5,
      noQuestion: 1,
      untested: 2,
      byChapter: [
        { chapterIndex: 0, tested: 1, total: 2 },
        { chapterIndex: 1, tested: 1, total: 3 },
      ],
    })
    expect(coverage.tested + coverage.noQuestion + coverage.untested).toBe(coverage.total)
  })

  it('keeps real chapter indices when a middle chapter has no concepts', () => {
    const coverage = diagnosticCoverage([
      { ...rest('a', 0), hasQuestion: true },
      { ...rest('b', 2, true), hasQuestion: true },
    ])
    expect(coverage.byChapter.map((c) => c.chapterIndex)).toEqual([0, 2])
  })

  it('has no chapters without chapter indices', () => {
    expect(diagnosticCoverage([{ ...rest('a', null), hasQuestion: true }]).byChapter).toEqual([])
  })
})

describe('homeChapterIndex', () => {
  it('finds the chapter holding the first segment', () => {
    expect(homeChapterIndex([], 4)).toBeNull()
    expect(homeChapterIndex([0, 10, 20], 0)).toBe(0)
    expect(homeChapterIndex([0, 10, 20], 15)).toBe(1)
    expect(homeChapterIndex([0, 10, 20], 99)).toBe(2)
    expect(homeChapterIndex([5, 10], 2)).toBe(0)
  })
})
