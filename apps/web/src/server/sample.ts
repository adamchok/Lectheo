import { eq, profiles, sql } from '@lectheo/db'
import { rowsOf, type DbLike } from './db'

/* Sample accounts (Data Model §3, ADR-014). SQL functions live in migration 0002_clone_sample. */

export const SAMPLE_DISPLAY_NAME = 'Sample student'
export const SAMPLE_MAX_AGE = '24 hours'

/** The seed student (profiles.kind = 'seed'). Exactly one must exist (written by the seed script). */
export async function resolveSeedId(db: DbLike): Promise<string> {
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.kind, 'seed'))
    .limit(2)
  if (rows.length !== 1 || !rows[0]) {
    throw new Error(`Expected exactly one seed profile, found ${rows.length}. Run the seed script.`)
  }
  return rows[0].id
}

/** One transaction: create the sample profile and copy the seed student's progress into it. */
export async function createSampleAccount(db: DbLike, userId: string): Promise<void> {
  const seedId = await resolveSeedId(db)
  await db.transaction(async (tx) => {
    await tx.insert(profiles).values({
      id: userId,
      kind: 'sample',
      displayName: SAMPLE_DISPLAY_NAME,
      seededFrom: seedId,
    })
    await tx.execute(sql`select clone_sample(${seedId}::uuid, ${userId}::uuid)`)
  })
}

/** One transaction: delete the user's per-user rows, then clone again. */
export async function resetSampleAccount(db: DbLike, userId: string): Promise<void> {
  const seedId = await resolveSeedId(db)
  await db.transaction(async (tx) => {
    await tx.execute(sql`select reset_sample(${userId}::uuid)`)
    await tx.execute(sql`select clone_sample(${seedId}::uuid, ${userId}::uuid)`)
  })
}

/** Deletes sample profiles older than 24 h (rows cascade). Returns their ids (= auth user ids). */
export async function purgeSampleAccounts(db: DbLike): Promise<string[]> {
  const result = await db.execute(
    sql`select purge_sample_accounts(${SAMPLE_MAX_AGE}::interval) as id`,
  )
  return rowsOf<{ id: string }>(result).map((r) => r.id)
}
