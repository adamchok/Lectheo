import { defineConfig, devices } from '@playwright/test'

// E2E runs the judge path with AI_FAKE=1 for determinism (Architecture §10).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // Recorder tests (feature-record-live) use a fake mic.
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
        },
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000/api/v1/health',
        reuseExistingServer: true,
        env: { AI_FAKE: '1' },
        timeout: 120_000,
      },
})
