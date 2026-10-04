import { eq, markers, profiles } from '@lectheo/db'
import { createTestDb, type TestDb } from '@lectheo/db/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DbLike } from './db'
import {
  createSampleAccount,
  purgeSampleAccounts,
  resetSampleAccount,
  resolveSeedId,
} from './sample'

// The full clone/remap matrix is tested at the SQL level in packages/db (clone-sample.test.ts).
const SEED = '0190a000-0000-7000-8000-00000000000a'
const USER = '0190a000-0000-7000-8000-00000000000b'
const COURSE = '0190a000-0000-7000-8000-00000000000c'
const LECTURE = '0190a000-0000-7000-8000-00000000000d'

let testDb: TestDb
let db: DbLike

beforeEach(async () => {
  testDb = await createTestDb()
  db = testDb as unknown as DbLike
  await testDb.$client.exec(`
    INSERT INTO profiles (id, kind) VALUES ('${SEED}', 'seed');
    INSERT INTO courses (id, kind, title) VALUES ('${COURSE}', 'library', 'CS50x');
    INSERT INTO lectures (id, course_id, title, seq, source)
      VALUES ('${LECTURE}', '${COURSE}', 'L5', 5, 'library');
    INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture)
      VALUES (gen_random_uuid(), '${LECTURE}', '${SEED}', 'lost', 1000, 'watch');
  `)
})

const markerCount = async (userId: string) =>
  (await db.select().from(markers).where(eq(markers.userId, userId))).length

describe('sample accounts', () => {
  it('resolves the single seed profile', async () => {
    expect(await resolveSeedId(db)).toBe(SEED)
  })

  it('creates the profile and clones the seed in one transaction', async () => {
    await createSampleAccount(db, USER)
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, USER))
    expect(profile).toMatchObject({
      kind: 'sample',
      displayName: 'Sample student',
      seededFrom: SEED,
    })
    expect(await markerCount(USER)).toBe(1)
  })

  it('rolls back the profile when the clone fails', async () => {
    await testDb.$client.exec(`UPDATE profiles SET kind = 'owner' WHERE id = '${SEED}'`)
    await expect(createSampleAccount(db, USER)).rejects.toThrow(/seed profile/)
    expect(await db.select().from(profiles).where(eq(profiles.id, USER))).toEqual([])
  })

  it('reset deletes per-user rows and clones again', async () => {
    await createSampleAccount(db, USER)
    await db.insert(markers).values({
      id: '0190a000-0000-7000-8000-0000000000ff',
      lectureId: LECTURE,
      userId: USER,
      kind: 'important',
      tMs: 5,
      capture: 'watch',
    })
    expect(await markerCount(USER)).toBe(2)
    await resetSampleAccount(db, USER)
    expect(await markerCount(USER)).toBe(1)
  })

  it('purges sample accounts older than 24 h', async () => {
    await createSampleAccount(db, USER)
    expect(await purgeSampleAccounts(db)).toEqual([])
    await db.update(profiles).set({ createdAt: new Date(Date.now() - 25 * 3600_000) })
    expect(await purgeSampleAccounts(db)).toEqual([USER])
    expect(await markerCount(USER)).toBe(0)
  })
})
