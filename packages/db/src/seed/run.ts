/**
 * pnpm db:seed — loads the CS50x dev/demo fixture and the seed student into an already-migrated
 * database. Env: POSTGRES_URL_NON_POOLING (preferred) or POSTGRES_URL; optional SEED_BASE_DATE
 * (ISO date) anchoring the seed student's "last few days" (default: today 12:00 UTC).
 * Safe to re-run: every insert is ON CONFLICT DO NOTHING with stable ids.
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../schema'
import { SEED_STUDENT_ID } from './ids'
import { seedLibrary, seedStudent } from './load'

const NOON_UTC_HOUR = 12

function baseDateFromEnv(): Date {
  const raw = process.env.SEED_BASE_DATE
  if (raw) {
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) throw new Error(`SEED_BASE_DATE is not a date: ${raw}`)
    return date
  }
  const today = new Date()
  today.setUTCHours(NOON_UTC_HOUR, 0, 0, 0)
  return today
}

async function main(): Promise<void> {
  const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
  if (!url) throw new Error('Set POSTGRES_URL_NON_POOLING or POSTGRES_URL')
  const sql = postgres(url, { max: 1 })
  try {
    const db = drizzle(sql, { schema })
    const baseDate = baseDateFromEnv()
    const library = await seedLibrary(db)
    const student = await seedStudent(db, { baseDate })
    console.info('Seeded CS50x library fixture (rows in fixture):')
    console.table(library)
    console.info(`Seed student ${SEED_STUDENT_ID} (base date ${baseDate.toISOString()}):`)
    console.table(student)
  } finally {
    await sql.end()
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
