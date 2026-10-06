import { expect, test } from '@playwright/test'
import { LIBRARY_COURSE_ID, signInSample } from './fixtures'

/*
 * A finished spot-the-flaw on a library concept: the result links back to the map, the page
 * carries the CS50 license notice (F7.4), and a reload still shows how it was graded.
 */

test('spot the flaw: map link, license notice and the rubric after reload', async ({ page }) => {
  await signInSample(page)
  await page.goto(`/courses/${LIBRARY_COURSE_ID}`)
  await page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i }).click()
  await page
    .getByRole('complementary', { name: /^pointers\b/i })
    .getByRole('button', { name: 'Spot the flaw' })
    .click()
  await expect(page).toHaveURL(/\/activities\//)
  await expect(page.getByText(/CS50x 2026 by Harvard University/)).toBeVisible()

  // Try 1, and a different try 2 if the first wasn't final (an identical body would replay
  // try 1): closes the activity either way.
  await page.getByRole('radio', { name: 'No flaw' }).check({ force: true })
  await page.getByRole('button', { name: 'Submit' }).click()
  const retry = page.getByRole('button', { name: 'Retry' })
  const graded = page.getByRole('heading', { name: 'How it was graded' })
  await expect(retry.or(graded)).toBeVisible()
  if (await retry.isVisible()) {
    await retry.click()
    await page.getByRole('radio', { name: 'Flawed' }).check({ force: true })
    await page.getByRole('radio', { name: 'Sentence 1' }).check({ force: true })
    await page.getByRole('textbox', { name: /what should it say instead/i }).fill('It is wrong.')
    await page.getByRole('button', { name: 'Submit' }).click()
  }
  await expect(graded).toBeVisible()
  await expect(page.getByRole('link', { name: 'See it on the map' })).toHaveAttribute(
    'href',
    `/courses/${LIBRARY_COURSE_ID}`,
  )

  await page.reload()
  await expect(graded).toBeVisible()
})
