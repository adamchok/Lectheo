import { expect, test } from '@playwright/test'
import { signInSample } from './fixtures'

/*
 * F10 with fakes (AI_FAKE=1: the fake YouTube Data API and the fake transcriber): a sample
 * account pastes a YouTube link, sees a refusal, then the preview, adds the lecture, and the
 * pipeline runs through transcribeVideo to the Study page.
 */
test('add a YouTube lecture as a sample account and study it', async ({ page }) => {
  test.setTimeout(150_000)
  await signInSample(page)
  await page.getByRole('link', { name: 'Add lecture' }).click()
  await expect(page).toHaveURL(/\/lectures\/new$/)

  await page.getByRole('textbox', { name: 'Course' }).fill('E2E YouTube')
  await page.getByRole('tab', { name: 'From YouTube' }).click()
  const link = page.getByRole('textbox', { name: 'YouTube link' })
  const preview = page.getByTestId('youtube-preview')

  // A refusal is named in plain words, and the lecture can't be added.
  await link.fill('https://www.youtube.com/watch?v=fakeNoEmbed')
  await expect(preview.getByRole('alert')).toContainText('doesn’t allow it to play on other sites')
  // Sample accounts: up to 20 minutes.
  await link.fill('https://youtu.be/fakeLong45m')
  await expect(preview.getByRole('alert')).toContainText('longer than your limit of 20 minutes')

  await link.fill('https://youtu.be/6Svu_ae5ebk?t=42')
  await expect(preview.getByText('Test lecture 6Svu_ae5ebk')).toBeVisible()
  await expect(preview.getByText('Lectheo test channel · 15 min')).toBeVisible()
  await expect(preview.getByRole('alert')).toHaveCount(0)

  const add = page.getByRole('button', { name: 'Add lecture' })
  await expect(add).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('checkbox', { name: /using this video for my own study/i }).check()
  await add.click()

  await expect(page).toHaveURL(/\/lectures\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Test lecture 6Svu_ae5ebk' })).toBeVisible()
  // map_ready → the lecture opens in Study (F9.1) with its concepts and clips.
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('link', { name: 'Watch', exact: true }).first()).toBeVisible()
})
