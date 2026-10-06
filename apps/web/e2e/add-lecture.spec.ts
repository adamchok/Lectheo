import { expect, test } from '@playwright/test'
import { signInSample } from './fixtures'

const TRANSCRIPT = [
  'Today we look at stacks and queues.',
  'A stack is last in, first out: you push onto the top and pop from the top.',
  'A queue is first in, first out: you enqueue at the back and dequeue from the front.',
  'Both can be built on arrays or on linked lists, trading fixed size for pointer overhead.',
  'Function calls use a stack, which is why deep recursion can overflow it.',
].join('\n')

// Wave 2 smoke: paste a transcript → the pipeline (Vercel Workflows, local world) → map → delete.
test('add a lecture from a pasted transcript, see its map, delete it', async ({ page }) => {
  test.setTimeout(150_000)
  await signInSample(page)
  await page.getByRole('link', { name: 'Add lecture' }).click()
  await expect(page).toHaveURL(/\/lectures\/new$/)

  await page.getByRole('textbox', { name: 'Course' }).fill('E2E Data Structures')
  await page.getByRole('textbox', { name: 'Lecture title' }).fill('Stacks and queues')
  await page.getByRole('checkbox', { name: /i have permission/i }).check()
  await page.getByRole('tab', { name: 'Transcript only' }).click()
  await page.getByRole('tab', { name: 'Paste text' }).click()
  await page.getByRole('textbox', { name: 'Transcript text' }).fill(TRANSCRIPT)
  await page.getByRole('button', { name: 'Upload and build my map' }).click()

  await expect(page).toHaveURL(/\/lectures\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const lectureUrl = page.url()
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 90_000 })

  await page.getByRole('link', { name: 'Concept map' }).first().click()
  await expect(page.getByRole('heading', { name: 'E2E Data Structures' })).toBeVisible()
  await expect(page.getByText(/^[1-9]\d* concepts? across 1 lecture/)).toBeVisible()

  await page.goto(lectureUrl)
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete lecture' }).click()
  await expect(page.getByText('Lecture deleted')).toBeVisible()
  await expect(page.getByText(/0 concepts across 0 lectures/)).toBeVisible()

  // F0.7: rename the course, then delete it (also cleans up the test data).
  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByRole('textbox', { name: 'Course name' }).fill('E2E Renamed')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { name: 'E2E Renamed' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete course' }).click()
  const confirm = page.getByRole('dialog')
  await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await confirm.getByRole('button', { name: 'Delete course' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByText('Course deleted')).toBeVisible()
})
