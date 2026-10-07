import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // YouTube lectures (F10) are switched off by default; tests cover them switched on.
    env: { AI_FAKE: '1', FEATURE_YOUTUBE_LECTURES: '1' },
    // PGlite boots + migrates per test (~4–8 s on CI runners); the 5 s default is too tight.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
