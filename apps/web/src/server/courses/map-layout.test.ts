import { beforeEach, describe, expect, it } from 'vitest'
import { rowsOf } from '../db'
import { getCourseMap } from './map'
import { ACTOR_A, ACTOR_B, createFixture, type Fixture, ID } from './test-fixtures'

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
})

async function storedLayout(courseId: string) {
  const res = await f.testDb.$client.query(
    `SELECT layout, layout_hash FROM courses WHERE id = '${courseId}'`,
  )
  return rowsOf<{ layout: Record<string, unknown> | null; layout_hash: string | null }>(res)[0]!
}

describe('GET /courses/{id}/map layout', () => {
  it('computes and stores a personal course layout once, then reuses it', async () => {
    const first = await getCourseMap(ACTOR_A, ID.P, f.db)
    expect(first.nodes.every((n) => n.position !== null)).toBe(true)
    const stored = await storedLayout(ID.P)
    expect(stored.layout_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(stored.layout ?? {}).sort()).toEqual([ID.PC1, ID.PC2].sort())

    // A stored layout with a matching hash is served as-is: no recompute.
    const pinned = { [ID.PC1]: { x: 1, y: 2 }, [ID.PC2]: { x: 3, y: 4 } }
    await f.exec(
      `UPDATE courses SET layout = '${JSON.stringify(pinned)}'::jsonb WHERE id = '${ID.P}'`,
    )
    const second = await getCourseMap(ACTOR_A, ID.P, f.db)
    expect(second.nodes.find((n) => n.id === ID.PC1)?.position).toEqual({ x: 1, y: 2 })
    expect((await storedLayout(ID.P)).layout).toEqual(pinned)
  })

  it('recomputes a personal course layout when the graph changes', async () => {
    await getCourseMap(ACTOR_A, ID.P, f.db)
    const before = await storedLayout(ID.P)
    await f.exec(`
      INSERT INTO concept_edges (id, course_id, from_concept_id, to_concept_id, relation, segment_idxs)
      VALUES (gen_random_uuid(), '${ID.P}', '${ID.PC2}', '${ID.PC1}', 'depends_on', '{0}')`)
    await getCourseMap(ACTOR_A, ID.P, f.db)
    expect((await storedLayout(ID.P)).layout_hash).not.toBe(before.layout_hash)
  })

  it('never writes the library course: it serves the seed layout', async () => {
    const before = await storedLayout(ID.LIB)
    const map = await getCourseMap(ACTOR_B, ID.LIB, f.db)
    expect(await storedLayout(ID.LIB)).toEqual(before)
    expect(map.nodes.find((n) => n.id === ID.C1)?.position).toEqual({ x: 10, y: 20 })
  })
})
