import { expect, test, type Page } from '@playwright/test'
import { LECTURES, LIBRARY_CHAPTERS, lectureId } from '@lectheo/db/seed'
import { signInSample, silentWav } from './fixtures'

/*
 * Study mode (F9) and chapters (F11) on the sample account's Lecture 5, with AI_FAKE=1 and no
 * external media: YouTube is blocked (the MP3 fallback plays) and the MP3 is served as silence.
 */

const L5 = lectureId('l5')
const L5_CHAPTERS = LIBRARY_CHAPTERS.l5 ?? []
const L5_SEGMENTS = LECTURES.find((l) => l.key === 'l5')?.segments ?? []

async function offlineMedia(page: Page): Promise<void> {
  await page.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com/, (route) => route.abort())
  await page.route(/cdn\.cs50\.net\/.*\.mp3$/, (route) =>
    route.fulfill({ contentType: 'audio/wav', body: silentWav() }),
  )
}

test('study Lecture 5: mark a concept, then Test me starts with it', async ({ page }) => {
  await offlineMedia(page)
  await signInSample(page)
  const nextStep = page.getByRole('region', { name: /lecture 5/i })
  await expect(nextStep.getByRole('link', { name: 'Watch', exact: true })).toHaveAttribute(
    'href',
    `/lectures/${L5}/watch`,
  )
  await expect(nextStep.getByRole('link', { name: /skip to the diagnostic/i })).toBeVisible()
  await nextStep.getByRole('link', { name: /study lecture 5/i }).click()
  await expect(page).toHaveURL(new RegExp(`/lectures/${L5}$`))
  await expect(page.getByRole('link', { name: 'Study' }).first()).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByText(new RegExp(`${L5_CHAPTERS.length} chapters`))).toBeVisible()

  // Tries is taught last in Lecture 5, so without a mark the diagnostic would not start there.
  const tries = page.getByRole('article', { name: 'Tries' })
  await expect(tries.getByRole('listitem').first()).toBeVisible() // key points
  const triesId = (await tries.getAttribute('id'))?.replace('concept-', '') ?? ''

  await tries.getByRole('button', { name: /watch this part/i }).click()
  await expect(tries.locator('audio')).toBeAttached()

  const lost = tries.getByRole('button', { name: "I'm lost here" })
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/lectures/${L5}/markers`) && r.request().method() === 'POST',
  )
  await lost.click()
  expect((await saved).ok()).toBe(true)
  await expect(lost).toHaveAttribute('aria-pressed', 'true')

  const started = page.waitForResponse(
    (r) => r.url().endsWith(`/lectures/${L5}/diagnostic`) && r.request().method() === 'POST',
  )
  await page.getByRole('link', { name: 'Test me' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/lectures/${L5}/diagnostic$`))
  const plan = (await (await started).json()) as { items: { conceptId: string }[] }
  expect(plan.items[0]?.conceptId).toBe(triesId)
})

test('chapters tab: jump to a chapter and mark it', async ({ page }) => {
  await offlineMedia(page)
  // Records where the player is sent (the silent MP3 is too short to really get there).
  await page.addInitScript(() => {
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')
    Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
      get() {
        return desc?.get?.call(this)
      },
      set(value: number) {
        ;(window as unknown as { lastSeek: number }).lastSeek = value
        desc?.set?.call(this, value)
      },
    })
  })
  const tries = L5_CHAPTERS.find((c) => c.title === 'Tries')
  const triesStartMs = L5_SEGMENTS[tries?.start ?? -1]?.startMs ?? 0
  expect(triesStartMs).toBeGreaterThan(0)

  await signInSample(page)
  await page.goto(`/lectures/${L5}/watch`)
  await expect(page.getByRole('button', { name: /i'm lost/i }).first()).toBeEnabled({
    timeout: 45_000,
  })
  await expect(page.getByRole('button', { name: 'Play this chapter only' })).toBeVisible()

  await page.getByRole('tab', { name: 'Chapters' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Chapters' })
  await expect(panel.getByRole('listitem')).toHaveCount(L5_CHAPTERS.length)
  const triesRow = panel
    .getByRole('listitem')
    .filter({ has: page.getByText('Tries', { exact: true }) })
  await triesRow.getByRole('button').first().click()
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { lastSeek?: number }).lastSeek))
    .toBe(triesStartMs / 1000)

  const mark = panel.getByRole('button', { name: "I'm lost: Tries" })
  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/lectures/${L5}/markers`) && r.request().method() === 'POST',
  )
  await mark.click()
  expect((await saved).ok()).toBe(true)
  await expect(mark).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await page.getByRole('tab', { name: 'Chapters' }).click()
  await expect(
    page
      .getByRole('tabpanel', { name: 'Chapters' })
      .getByRole('button', { name: "I'm lost: Tries" }),
  ).toHaveAttribute('aria-pressed', 'true')
})
