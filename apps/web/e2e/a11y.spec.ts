import { expect, test, type Page } from '@playwright/test'
import { LIBRARY_COURSE_ID, lectureId, signInSample } from './fixtures'

/*
 * Keyboard focus and layout checks from the pre-submission a11y pass (WCAG 2.4.3, 1.4.10).
 * Each control below unmounts or is replaced when used; focus must land on what replaced it,
 * never on <body>.
 */

const L5 = lectureId('l5')
const MAX_DIAGNOSTIC_QUESTIONS = 20

async function openPractice(page: Page, name: string): Promise<void> {
  await page.goto(`/courses/${LIBRARY_COURSE_ID}`)
  await page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i }).click()
  await page
    .getByRole('complementary', { name: /^pointers\b/i })
    .getByRole('button', { name })
    .click()
  await expect(page).toHaveURL(/\/activities\//)
}

test('route change and "Done watching" keep keyboard focus on the page', async ({ page }) => {
  await page.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com/, (route) => route.abort())
  await signInSample(page)

  await page.getByRole('link', { name: /start watching/i }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/lectures/${L5}/watch$`))
  await expect(page.locator('#main')).toBeFocused()

  await page.getByRole('button', { name: /done watching/i }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator(':focus')).toContainText(/take the diagnostic/i)
})

test('diagnostic by keyboard: options, next question and results take focus', async ({ page }) => {
  await signInSample(page)
  await page.goto(`/lectures/${L5}/diagnostic`)

  const question = page.getByRole('region', { name: 'Question' })
  const results = page.getByRole('heading', { name: 'Your results' })
  for (let i = 0; i < MAX_DIAGNOSTIC_QUESTIONS; i += 1) {
    await expect(question.or(results)).toBeVisible()
    if (await results.isVisible()) break
    await expect(question.getByRole('heading', { level: 2 })).toBeFocused()

    await page.keyboard.press('4') // "No idea"
    const options = question.getByRole('list', { name: 'Answer options' }).getByRole('button')
    await expect(options.first()).toBeFocused()
    await page.keyboard.press('Enter')
    const next = question.getByRole('button', {
      name: /one more on this idea|next question|see results/i,
    })
    await expect(next).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await expect(results).toBeFocused()
})

test('spot the flaw: submit focuses the result, retry focuses the form', async ({ page }) => {
  await signInSample(page)
  await openPractice(page, 'Spot the flaw')

  await page.getByRole('radio', { name: 'Correct' }).check({ force: true })
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('region', { name: 'Result' })).toBeFocused()

  const retry = page.getByRole('button', { name: 'Retry' })
  if (await retry.isVisible()) {
    await retry.click()
    await expect(page.getByRole('heading', { name: 'Your second try' })).toBeFocused()
  }
})

test('teach-back: the input keeps focus while Sam replies; feedback takes focus', async ({
  page,
}) => {
  await signInSample(page)
  await openPractice(page, 'Teach-back')

  const input = page.getByRole('textbox', { name: 'Your explanation' })
  await input.fill('A pointer is a variable that stores the memory address of another value.')
  await input.press('Enter')
  await expect(page.getByRole('list', { name: 'Conversation with Sam' })).toContainText('Sam:')
  await expect(input).toBeEnabled()
  await expect(input).toBeFocused()

  await page.getByRole('button', { name: "I'm done explaining" }).click()
  await expect(
    page.getByRole('heading', {
      name: /how your explanation landed|you taught it|getting there|not quite yet/i,
    }),
  ).toBeFocused()
})

test('a missing lecture offers a way back instead of a retry', async ({ page }) => {
  await signInSample(page)
  await page.goto('/lectures/01900000-0000-7000-8000-000000000000')
  await expect(page.getByRole('link', { name: 'Back to dashboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
})

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('landing page has no horizontal scroll', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBe(0)
  })

  test('the concept map opens as the list view', async ({ page }) => {
    await signInSample(page)
    await page.goto(`/courses/${LIBRARY_COURSE_ID}`)
    await expect(page.getByRole('radio', { name: 'List' })).toHaveAttribute('aria-checked', 'true')
  })
})
