import { createTestDb, type TestDb } from '@lectheo/db/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from './db'

vi.mock('server-only', () => ({}))
const USER = '0190a000-0000-7000-8000-0000000000f1'
const getUser = vi.fn()
vi.mock('./supabase', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({
        data: { claims: { sub: USER, is_anonymous: false, email: 'a@example.com' } },
        error: null,
      }),
      getUser,
    },
  }),
}))

const { getActor } = await import('./auth')

let testDb: TestDb
let db: DbLike

beforeEach(async () => {
  testDb = await createTestDb()
  db = testDb as unknown as DbLike
  getUser.mockReset()
})

const profileCount = async (): Promise<number> => {
  const { rows } = await testDb.$client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM profiles WHERE id = '${USER}'`,
  )
  return rows[0]?.n ?? 0
}

describe('getActor', () => {
  it('never recreates the profile of a deleted account from a still-valid token', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 403 } })
    expect(await getActor(db)).toBeNull()
    expect(await profileCount()).toBe(0)
  })

  it('creates a missing profile when the auth user still exists', async () => {
    getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null })
    expect(await getActor(db)).toEqual({ userId: USER, kind: 'google', isSample: false })
    expect(await profileCount()).toBe(1)
  })

  it('skips the Auth round trip when the profile exists', async () => {
    await testDb.$client.exec(`INSERT INTO profiles (id, kind) VALUES ('${USER}', 'google')`)
    expect(await getActor(db)).toMatchObject({ userId: USER })
    expect(getUser).not.toHaveBeenCalled()
  })
})
