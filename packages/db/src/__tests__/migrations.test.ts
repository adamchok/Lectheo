import { describe, expect, it } from 'vitest'
import { createTestDb } from '../testing'

describe('migrations', () => {
  it('apply cleanly and enable RLS on every public table (deny-all, ADR-003)', async () => {
    const db = await createTestDb()
    const { rows } = await db.$client.query<{ tablename: string; rowsecurity: boolean }>(
      `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'`,
    )
    expect(rows.length).toBeGreaterThanOrEqual(21)
    expect(rows.filter((r) => !r.rowsecurity).map((r) => r.tablename)).toEqual([])
  })

  it('seeds the single app_flags row', async () => {
    const db = await createTestDb()
    const { rows } = await db.$client.query(`SELECT * FROM app_flags`)
    expect(rows).toHaveLength(1)
  })
})
