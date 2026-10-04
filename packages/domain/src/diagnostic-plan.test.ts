import { describe, expect, it } from 'vitest'
import { NO_FLAGS_NOTE, planDiagnostic } from './diagnostic-plan'

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
