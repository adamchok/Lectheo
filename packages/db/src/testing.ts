import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { fileURLToPath } from 'node:url'
import * as schema from './schema'

export type TestDb = PgliteDatabase<typeof schema> & { $client: PGlite }

/**
 * In-process Postgres (PGlite) with all migrations applied. No Docker needed.
 * Use in Vitest for service/contract tests. Each call returns a fresh, isolated database.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
  return db as TestDb
}
