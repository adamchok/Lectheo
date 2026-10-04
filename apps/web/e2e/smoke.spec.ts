import { expect, test } from '@playwright/test'

test('sign-in page offers both entry points', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /explore with a sample account/i })).toBeVisible()
})

// TODO(feature-e2e-judge-path): sample sign-in → dashboard → watch L5 → tap L → map →
// diagnostic (confident mistake) → spot the flaw → teach-back → node turns green.
