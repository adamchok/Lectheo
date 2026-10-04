import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Db = PostgresJsDatabase<typeof schema>

let cached: { db: Db; sql: postgres.Sql } | undefined

/**
 * Module-scoped client via the Supabase transaction pooler:
 * prepare:false (pooler has no session state), max:3 per instance (Tech Stack §2).
 */
export function getDb(url = process.env.POSTGRES_URL): Db {
  if (cached) return cached.db
  if (!url) throw new Error('POSTGRES_URL is not set')
  const sql = postgres(url, { prepare: false, max: 3 })
  cached = { db: drizzle(sql, { schema }), sql }
  return cached.db
}

export async function closeDb(): Promise<void> {
  await cached?.sql.end()
  cached = undefined
}
