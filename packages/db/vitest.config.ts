import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // PGlite boots + migrates per test (~4–8 s on CI runners); the 5 s default is too tight.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
