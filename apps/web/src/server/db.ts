import { getDb, type Db } from '@lectheo/db'

/**
 * The database type server helpers accept. Helpers take it as a parameter so tests can pass the
 * PGlite client from '@lectheo/db/testing'.
 * ponytail: typed as the postgres.js Db (drizzle-orm isn't a direct dependency of the web app, so
 * PgDatabase isn't importable here); tests cast their PGlite TestDb to it. The query-builder API
 * is identical; only raw `execute()` results differ, which rowsOf() normalizes.
 */
export type DbLike = Db

/** The app database (lazy, module-scoped pooled client; reads POSTGRES_URL on first use). */
export const appDb = (): DbLike => getDb()

/** Rows of a raw `db.execute()` result (postgres.js returns an array, PGlite `{ rows }`). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as T[]) : []
}
