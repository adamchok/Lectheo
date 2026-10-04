import { beforeEach, describe, expect, it } from 'vitest'
import { rowsOf } from '../db'
import { getCourseMap } from './map'
import { ACTOR_A, ACTOR_B, createFixture, type Fixture, ID } from './test-fixtures'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

async function storedLayout() {
  const res = await f.testDb.$client.query(
    `SELECT layout, layout_hash FROM courses WHERE id = '${ID.LIB}'`,
  )
  return rowsOf<{ layout: Record<string, unknown>; layout_hash: string | null }>(res)[0]!
}

describe('GET /courses/{id}/map layout', () => {
  it('computes and stores the layout once, then reuses it', async () => {
    const first = await getCourseMap(ACTOR_A, ID.LIB, f.db)
    expect(first.nodes.every((n) => n.position !== null)).toBe(true)
    const stored = await storedLayout()
    expect(stored.layout_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(stored.layout).sort()).toEqual([ID.C1, ID.C2, ID.C3].sort())

    // A stored layout with a matching hash is served as-is: no recompute.
    const pinned = { [ID.C1]: { x: 1, y: 2 }, [ID.C2]: { x: 3, y: 4 }, [ID.C3]: { x: 5, y: 6 } }
    await f.exec(
      `UPDATE courses SET layout = '${JSON.stringify(pinned)}'::jsonb WHERE id = '${ID.LIB}'`,
    )
    const second = await getCourseMap(ACTOR_B, ID.LIB, f.db)
    expect(second.nodes.find((n) => n.id === ID.C1)?.position).toEqual({ x: 1, y: 2 })
    expect((await storedLayout()).layout).toEqual(pinned)
  })

  it('recomputes when the graph changes', async () => {
    await getCourseMap(ACTOR_A, ID.LIB, f.db)
    const before = await storedLayout()
    await f.exec(`DELETE FROM concept_edges WHERE id = '${ID.E1}'`)
    await getCourseMap(ACTOR_A, ID.LIB, f.db)
    expect((await storedLayout()).layout_hash).not.toBe(before.layout_hash)
  })
})
