import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTOR_A,
  ACTOR_S,
  addAttempt,
  addMarker,
  addSession,
  createFixture,
  type Fixture,
  ID,
} from '../courses/test-fixtures'
import type { RemoveObjects } from '../lectures/write'
import { deleteAccount } from './delete'

let f: Fixture
const deps = {
  removeObjects: vi.fn<RemoveObjects>(),
  removeUserObjects: vi.fn<(userId: string) => Promise<void>>(),
  deleteAuthUser: vi.fn<(userId: string) => Promise<void>>(),
}

const SESSION_A = '0190a000-0000-7000-8000-0000000000a1'

beforeEach(async () => {
  f = await createFixture()
  deps.removeObjects.mockReset().mockResolvedValue(undefined)
  deps.removeUserObjects.mockReset().mockResolvedValue(undefined)
  deps.deleteAuthUser.mockReset().mockResolvedValue(undefined)
  // A's footprint everywhere: own course (fixture), marks, practice and counters on library
  // content too, plus an AI-ledger row. B gets a marker that must survive.
  await addMarker(f, { lectureId: ID.L1, userId: ID.A, conceptId: ID.C1 })
  await addMarker(f, { lectureId: ID.PL1, userId: ID.A, conceptId: ID.PC1 })
  await addMarker(f, { lectureId: ID.L1, userId: ID.B })
  await addSession(f, { id: SESSION_A, userId: ID.A, lectureId: ID.L1, completed: true })
  await addAttempt(f, {
    userId: ID.A,
    conceptId: ID.C1,
    activityType: 'diagnostic',
    outcome: 'correct',
  })
  await addAttempt(f, {
    userId: ID.A,
    conceptId: ID.PC1,
    activityType: 'diagnostic',
    outcome: 'incorrect',
  })
  await f.exec(`
    INSERT INTO usage_counters (user_id, day, metric, count)
      VALUES ('${ID.A}', now(), 'lectures', 1);
    INSERT INTO llm_calls (id, user_id, task, role, model, prompt_version, outcome)
      VALUES (gen_random_uuid(), '${ID.A}', 'extract', 'gen', 'm', 'v1', 'ok');
  `)
})

const count = async (sql: string): Promise<number> => {
  const { rows } = await f.testDb.$client.query<{ n: number }>(sql)
  return rows[0]?.n ?? 0
}

/** Rows still pointing at A, per table: every user_id / owner_id column, plus profiles.id. */
async function rowsOfA(): Promise<Record<string, number>> {
  const { rows } = await f.testDb.$client.query<{ table_name: string; column_name: string }>(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (column_name IN ('user_id', 'owner_id') OR (table_name = 'profiles' AND column_name = 'id'))`)
  const counts: Record<string, number> = {}
  for (const { table_name: table, column_name: column } of rows) {
    const n = await count(`SELECT count(*)::int AS n FROM "${table}" WHERE "${column}" = '${ID.A}'`)
    if (n > 0) counts[table] = n
  }
  return counts
}

describe('DELETE /me', () => {
  it('leaves nothing of the user but their llm_calls rows', async () => {
    expect(Object.keys(await rowsOfA())).toEqual(
      expect.arrayContaining([
        'attempts',
        'courses',
        'diagnostic_sessions',
        'llm_calls',
        'markers',
        'profiles',
        'usage_counters',
      ]),
    )
    await deleteAccount(ACTOR_A, f.db, deps)

    expect(await rowsOfA()).toEqual({ llm_calls: 1 })
    expect(deps.removeUserObjects).toHaveBeenCalledWith(ID.A)
    expect(deps.removeObjects).toHaveBeenCalledWith('audio', [`${ID.A}/${ID.PL1}`])
    expect(deps.deleteAuthUser).toHaveBeenCalledWith(ID.A)
    // The library and other users are untouched.
    expect(await count(`SELECT count(*)::int AS n FROM markers WHERE user_id = '${ID.B}'`)).toBe(1)
    expect(
      await count(`SELECT count(*)::int AS n FROM lectures WHERE course_id = '${ID.LIB}'`),
    ).toBe(2)
  })

  it('403s sample accounts and deletes nothing', async () => {
    await expect(deleteAccount(ACTOR_S, f.db, deps)).rejects.toMatchObject({
      code: 'sample_account_restricted',
      status: 403,
    })
    expect(deps.removeUserObjects).not.toHaveBeenCalled()
    expect(deps.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('409s while one of the user’s lectures is processing, before deleting anything', async () => {
    // A second own course, listed first, must not be deleted before the 409.
    await f.exec(`
      INSERT INTO courses (id, kind, owner_id, title, created_at)
        VALUES ('0190a000-0000-7000-8000-0000000000c2', 'personal', '${ID.A}', 'Chem', now() - interval '1 day');
      UPDATE lectures SET status = 'map_ready' WHERE id = '${ID.PL2}';
    `)
    await expect(deleteAccount(ACTOR_A, f.db, deps)).rejects.toMatchObject({
      code: 'already_processing',
    })
    expect((await rowsOfA()).courses).toBe(2)
    expect(deps.removeObjects).not.toHaveBeenCalled()
    expect(deps.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('finishes on retry after Storage failed', async () => {
    deps.removeUserObjects.mockRejectedValueOnce(new Error('storage down'))
    await expect(deleteAccount(ACTOR_A, f.db, deps)).rejects.toThrow('storage down')
    // Courses are gone, but the profile (and so the session) remains for the retry.
    expect((await rowsOfA()).profiles).toBe(1)
    expect(deps.deleteAuthUser).not.toHaveBeenCalled()

    await deleteAccount(ACTOR_A, f.db, deps)
    expect(await rowsOfA()).toEqual({ llm_calls: 1 })
    expect(deps.deleteAuthUser).toHaveBeenCalledOnce()
  })

  it('finishes on retry after the auth user deletion failed', async () => {
    deps.deleteAuthUser.mockRejectedValueOnce(new Error('auth down'))
    await expect(deleteAccount(ACTOR_A, f.db, deps)).rejects.toThrow('auth down')
    expect(await rowsOfA()).toEqual({ llm_calls: 1 })

    // The session is still valid, so getActor() recreates an empty profile for the retry.
    await f.exec(`INSERT INTO profiles (id, kind) VALUES ('${ID.A}', 'google')`)
    await deleteAccount(ACTOR_A, f.db, deps)
    expect(await rowsOfA()).toEqual({ llm_calls: 1 })
    expect(deps.deleteAuthUser).toHaveBeenCalledTimes(2)
  })
})
