import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, E2E_PORT, e2eEnv } from './e2e/env'

const CI = Boolean(process.env.CI)

/*
 * Judge path e2e (Architecture §1 goal 1, §10): a production build with AI_FAKE=1 against the
 * running local Supabase, migrated and seeded by global setup. Each test signs in its own sample
 * account, so tests are independent and can run in parallel. Port 3100 so a dev server on 3000
 * (possibly with real AI keys) is never reused by accident.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  workers: 2,
  retries: CI ? 1 : 0,
  timeout: 90_000,
  // Abort cleanly (and write the report) well before the CI job's 15 min cap.
  globalTimeout: CI ? 10 * 60_000 : undefined,
  expect: { timeout: 15_000 },
  reporter: CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: E2E_BASE_URL,
    trace: CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/api/v1/health`,
    // Never reuse a stale server: it would run an old build with whatever env it started with.
    reuseExistingServer: false,
    env: e2eEnv(),
    timeout: 300_000,
  },
})
