import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
if (!url) throw new Error('POSTGRES_URL_NON_POOLING (or POSTGRES_URL) is not set')

const sql = postgres(url, { max: 1 })
await migrate(drizzle(sql), { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
await sql.end()
console.log('migrations applied')
