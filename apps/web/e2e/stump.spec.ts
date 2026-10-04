import { expect, test } from '@playwright/test'
import { LIBRARY_COURSE_ID, signInSample } from './fixtures'

/*
 * Stump the AI (F4d, beta) with AI_FAKE=1: the fake referee rejects text without a "?", so the
 * flow is sample → map → Pointers → Stump → rejected → revise → accepted.
 */
test('stump the AI: rejected, revised, accepted', async ({ page }) => {
  await signInSample(page)
  await page.getByRole('link', { name: 'Concept map', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/${LIBRARY_COURSE_ID}$`))
  await page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i }).click()
  const panel = page.getByRole('complementary', { name: /^pointers\b/i })
  await panel.getByRole('button', { name: 'Stump the AI' }).click()

  await expect(page).toHaveURL(/\/activities\/[^/?]+\?from=red$/)
  await expect(page.getByRole('heading', { name: /can you stump the ai/i })).toBeVisible()
  await expect(page.getByText('Beta', { exact: true })).toBeVisible()

  const question = page.getByRole('textbox', { name: 'Your question' })
  const key = page.getByRole('textbox', { name: 'Your answer key' })
  await question.fill('Dereferencing a NULL pointer in C')
  await key.fill('Undefined behaviour; usually a segfault.')
  await expect(page.getByText(/^33\/1000$/)).toBeVisible()
  await page.getByRole('button', { name: 'Submit to the referee' }).click()

  const result = page.getByRole('region', { name: 'Result' })
  await expect(result.getByText('Not accepted')).toBeVisible()
  await expect(result.getByText(/2 tries left/)).toBeVisible()

  await question.fill('What happens when you dereference a NULL pointer in C?')
  await page.getByRole('button', { name: 'Resubmit' }).click()

  await expect(result.getByText(/^Accepted/)).toBeVisible()
  await expect(result.getByText("The AI's answer")).toBeVisible()
  await expect(result.getByText(/grounded in the lecture|standard course knowledge/i)).toBeVisible()
  await expect(question).toBeHidden()
})
