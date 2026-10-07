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

  await tries.getByRole('button', { name: /^watch from/i }).click()
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

/** Records where the player is sent (the silent MP3 is too short to really get there). */
async function recordSeeks(page: Page): Promise<void> {
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
}

const lastSeek = (page: Page) =>
  page.evaluate(() => (window as unknown as { lastSeek?: number }).lastSeek)

test('study by chapter: outline jump, explain in depth, a ▶ link plays (F9.10–F9.13)', async ({
  page,
}) => {
  await offlineMedia(page)
  await recordSeeks(page)
  await signInSample(page)
  await page.goto(`/lectures/${L5}`)

  const outline = page.getByRole('navigation', { name: 'Outline' })
  await expect(outline.getByRole('listitem')).toHaveCount(L5_CHAPTERS.length)
  await expect(outline.getByRole('link', { name: 'Test me' })).toBeVisible()
  await expect(page.getByText(/min with depth/)).toBeVisible()
  await expect(page.getByText(/in chapter \d/i)).toHaveCount(0) // F9.12: the section replaces it

  // Jump to the Tries chapter: the URL and the outline follow.
  const triesLink = outline.getByRole('link', { name: /Tries/ })
  await triesLink.click()
  await expect(page).toHaveURL(/#chapter-/)
  const section = page.getByRole('region', { name: 'Tries', exact: true })
  await expect(section.getByRole('heading', { level: 2, name: 'Tries' })).toBeInViewport()
  await expect(triesLink).toHaveAttribute('aria-current', 'location')
  await expect(section.getByRole('button', { name: /play this chapter/i })).toBeVisible()

  // Explain in depth: collapsed, then the four parts, labelled as AI-written.
  const tries = page.getByRole('article', { name: 'Tries' })
  const explain = tries.getByRole('button', { name: /explain in depth/i })
  await expect(explain).toHaveAttribute('aria-expanded', 'false')
  await explain.click()
  for (const part of ['How it works', 'Worked example', 'Common mistakes']) {
    await expect(tries.getByRole('heading', { name: part })).toBeVisible()
  }
  await expect(tries.getByText('AI-written from the lecture')).toBeVisible()

  // A ▶ link in How it works plays that moment in the block's player.
  const how = tries.getByRole('heading', { name: 'How it works' }).locator('..')
  const play = how.getByRole('button', { name: /^play from/i }).first()
  const at = (await play.textContent())?.match(/\d+(?::\d+)+/)?.[0] ?? ''
  await play.click()
  await expect(tries.locator('audio')).toBeAttached()
  const toSeconds = (clock: string) => clock.split(':').reduce((acc, p) => acc * 60 + Number(p), 0)
  await expect.poll(() => lastSeek(page)).toBeGreaterThanOrEqual(toSeconds(at))

  // One player per page: playing the chapter closes the concept's, and the other way round.
  await section.getByRole('button', { name: /play this chapter/i }).click()
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(tries.locator('audio')).toHaveCount(0)
  await tries.getByRole('button', { name: /^watch from/i }).click()
  await expect(page.locator('audio')).toHaveCount(1)
  await expect(tries.locator('audio')).toHaveCount(1)
})

test('study on a phone: the outline is a Jump to menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await offlineMedia(page)
  await signInSample(page)
  await page.goto(`/lectures/${L5}`)
  await expect(page.getByRole('navigation', { name: 'Outline' })).toBeHidden()
  const jump = page.getByLabel('Jump to')
  await expect(jump.locator('option')).toHaveCount(L5_CHAPTERS.length)
  const value = await jump.locator('option', { hasText: 'Tries' }).getAttribute('value')
  await jump.selectOption(value ?? '')
  await expect(
    page.getByRole('region', { name: 'Tries', exact: true }).getByRole('heading', { level: 2 }),
  ).toBeInViewport()
})

test('chapters tab: jump to a chapter and mark it', async ({ page }) => {
  await offlineMedia(page)
  await recordSeeks(page)
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
