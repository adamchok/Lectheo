import { execSync } from 'node:child_process'
import { assertLocalDatabase, e2eEnv, REPO_ROOT } from './env'

/**
 * Migrates and re-seeds the local database (seed rows are upserted by stable id). Every test
 * signs in a fresh sample account, which clones the seed student, so no per-test reset is needed.
 */
export default function globalSetup(): void {
  const env = e2eEnv()
  assertLocalDatabase(env.POSTGRES_URL_NON_POOLING)
  const run = (cmd: string) =>
    execSync(cmd, { cwd: REPO_ROOT, stdio: 'inherit', env: { ...process.env, ...env } })
  run('pnpm db:migrate')
  run('pnpm db:seed')
}
