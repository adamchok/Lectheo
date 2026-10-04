import { describe, expect, it } from 'vitest'
import { computeLayout, layoutHash, type LayoutEdge } from './layout'

const concepts = ['c_loops', 'c_types', 'c_arrays', 'c_memory', 'c_lonely'].map((id) => ({ id }))
const edges: LayoutEdge[] = [
  { id: 'e1', from: 'c_arrays', to: 'c_types', relation: 'depends_on' },
  { id: 'e2', from: 'c_memory', to: 'c_arrays', relation: 'depends_on' },
  { id: 'e3', from: 'c_loops', to: 'c_types', relation: 'contrasts_with' },
  { id: 'e4', from: 'c_arrays', to: 'c_gone', relation: 'part_of' },
]

describe('layoutHash', () => {
  it('ignores input order and changes when the graph changes', () => {
    const hash = layoutHash(concepts, edges)
    expect(layoutHash([...concepts].reverse(), [...edges].reverse())).toBe(hash)
    expect(layoutHash(concepts, edges.slice(1))).not.toBe(hash)
    expect(layoutHash(concepts.slice(1), edges)).not.toBe(hash)
  })
})

describe('computeLayout', () => {
  it('positions every concept, prerequisites before dependents', async () => {
    const layout = await computeLayout(concepts, edges)
    expect(Object.keys(layout).sort()).toEqual(concepts.map((c) => c.id).sort())
    expect(layout.c_types!.x).toBeLessThan(layout.c_arrays!.x)
    expect(layout.c_arrays!.x).toBeLessThan(layout.c_memory!.x)
  })

  it('is deterministic regardless of input order', async () => {
    const a = await computeLayout(concepts, edges)
    const b = await computeLayout([...concepts].reverse(), [...edges].reverse())
    expect(b).toEqual(a)
  })

  it('returns an empty layout for no concepts', async () => {
    expect(await computeLayout([], [])).toEqual({})
  })
})
