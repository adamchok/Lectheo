import { defineConfig } from 'drizzle-kit'

// Migrations run against the non-pooling URL (Supabase session/direct connection).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL ?? '',
  },
  strict: true,
})
