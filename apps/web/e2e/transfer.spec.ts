import { expect, test } from '@playwright/test'
import { LIBRARY_COURSE_ID, signInSample } from './fixtures'

/*
 * Transfer problem (F4b) with AI_FAKE=1. The fake judge gives the first criterion full marks and
 * the rest 1, so try 1 is partial → guiding question → retry → final reveal.
 */

test('transfer: map → Pointers → Transfer problem → submit twice → reveal', async ({ page }) => {
  await signInSample(page)
  await page.getByRole('link', { name: 'Concept map', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/${LIBRARY_COURSE_ID}$`))
  await page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i }).click()
  const panel = page.getByRole('complementary', { name: /^pointers\b/i })
  await panel.getByRole('button', { name: 'Transfer problem' }).click()

  await expect(page).toHaveURL(/\/activities\/[^/?]+\?from=red$/)
  await expect(page.getByRole('heading', { name: /apply it to a new problem/i })).toBeVisible()

  const answer = page.getByRole('textbox', { name: 'Your answer' })
  await answer.fill('Pass the address with & and change the value through * inside the function.')
  await page.getByRole('button', { name: 'Submit' }).click()

  const result = page.getByRole('region', { name: 'Result' })
  await expect(result.getByText(/try 1 of 2/i)).toBeVisible()
  await expect(result.getByText('Think about this')).toBeVisible()
  // The rubric and model solution stay hidden until the final try.
  await expect(page.getByRole('heading', { name: 'Model solution' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'How it was graded' })).toHaveCount(0)

  await result.getByRole('button', { name: 'Retry' }).click()
  await page
    .getByRole('textbox', { name: 'Your revised answer' })
    .fill('A pointer stores an address; dereferencing it with * reads or writes that memory.')
  await page.getByRole('button', { name: 'Submit' }).click()

  await expect(result.getByText(/try 2 of 2/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Model solution' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'How it was graded' })).toBeVisible()
  await expect(page.getByText('From the lecture').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: /your mastery of this concept/i })).toBeVisible()
})
