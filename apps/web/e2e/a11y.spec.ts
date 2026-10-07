import { expect, test, type Page } from '@playwright/test'
import { closeDb } from '@lectheo/db'
import { flawKeyOf, LIBRARY_COURSE_ID, lectureId, signInSample } from './fixtures'

// The answer-key lookup opens a DB pool; close it so the worker can exit.
test.afterAll(closeDb)

/*
 * Keyboard focus and layout checks from the pre-submission a11y pass (WCAG 2.4.3, 1.4.10).
 * Each control below unmounts or is replaced when used; focus must land on what replaced it,
 * never on <body>.
 */

const L5 = lectureId('l5')

async function openPractice(page: Page, name: string): Promise<void> {
  await page.goto(`/courses/${LIBRARY_COURSE_ID}`)
  await page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i }).click()
  await page
    .getByRole('complementary', { name: /^pointers\b/i })
    .getByRole('button', { name })
    .click()
  await expect(page).toHaveURL(/\/activities\//)
}

const ACTIVITY_GET = /\/api\/v1\/activities\/[^/]+$/

/**
 * Holds the activity refetch that follows a submit for a second. Retry is already on screen
 * (the cache is updated first) while the submit's own callbacks wait for this refetch, so a
 * Retry click lands inside that window every time. Resolves once the refetch has landed.
 */
async function holdRefetchAfterSubmit(page: Page): Promise<() => Promise<void>> {
  await page.route(
    (url) => ACTIVITY_GET.test(url.pathname),
    async (route) => {
      if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 1_000))
      await route.continue()
    },
  )
  const refetched = page.waitForResponse(
    (r) => r.request().method() === 'GET' && ACTIVITY_GET.test(new URL(r.url()).pathname),
  )
  return async () => {
    await refetched
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(250) // let the submit's callbacks run and render
  }
}

test('route change and "Done watching" keep keyboard focus on the page', async ({ page }) => {
  await page.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com/, (route) => route.abort())
  await signInSample(page)

  await page
    .getByRole('region', { name: /lecture 5/i })
    .getByRole('link', { name: 'Watch', exact: true })
    .focus()
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
  const stem = question.getByRole('heading', { level: 2 })
  const options = question.getByRole('list', { name: 'Answer options' })

  // Rating moves focus to the options list (not option A, so a stray Enter answers nothing).
  await expect(stem).toBeFocused()
  await page.keyboard.press('4') // "No idea"
  await expect(options).toBeFocused()

  // Resumed with confidence already recorded: the options load, focus stays on the question.
  await page.reload()
  await expect(options).toBeVisible()
  await expect(stem).toBeFocused()

  // "No idea" never triggers a follow-up, so the count shown up front is the whole diagnostic.
  const total = Number(
    (await page.getByText(/^Question 1 of \d+/).textContent())?.match(/of (\d+)/)?.[1],
  )
  expect(total).toBeGreaterThan(0)
  for (let i = 0; i < total; i += 1) {
    if (i > 0) {
      await expect(stem).toBeFocused()
      await page.keyboard.press('4')
      await expect(options).toBeFocused()
    }
    await page.keyboard.press('Tab')
    await expect(options.getByRole('button').first()).toBeFocused()
    await page.keyboard.press('Enter')
    const next = question.getByRole('button', {
      name: i === total - 1 ? 'See results' : 'Next question',
    })
    await expect(next).toBeFocused()
    await page.keyboard.press('Enter')
  }
  await expect(page.getByRole('heading', { name: 'Your results' })).toBeFocused()
})

test('spot the flaw: submit focuses the result, retry focuses the form', async ({ page }) => {
  await signInSample(page)
  await openPractice(page, 'Spot the flaw')

  // A wrong first try (from the answer key), so the Socratic retry always follows.
  const key = await flawKeyOf(new URL(page.url()).pathname.split('/').at(-1) ?? '')
  if (key.hasFlaw) {
    await page.getByRole('radio', { name: 'No flaw' }).check({ force: true })
  } else {
    await page.getByRole('radio', { name: 'Flawed' }).check({ force: true })
    await page.getByRole('radio', { name: 'Sentence 1' }).check({ force: true })
    await page.getByRole('textbox', { name: /what should it say instead/i }).fill('It is wrong.')
  }
  const settled = await holdRefetchAfterSubmit(page)
  await page.getByRole('button', { name: 'Submit' }).click()
  const result = page.getByRole('region', { name: 'Result' })
  await expect(result).toBeFocused()

  await result.getByRole('button', { name: 'Retry' }).click()
  await settled()
  await expect(page.getByRole('heading', { name: 'Your second try' })).toBeFocused()
})

test('transfer: Retry clicked while the result refetches opens the revised answer', async ({
  page,
}) => {
  await signInSample(page)
  await openPractice(page, 'Transfer problem')

  // Same answer as transfer.spec: graded "partly right" under AI_FAKE, so a retry follows.
  await page
    .getByRole('textbox', { name: 'Your answer' })
    .fill('Pass the address with & and change the value through * inside the function.')
  const settled = await holdRefetchAfterSubmit(page)
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('region', { name: 'Result' }).getByRole('button', { name: 'Retry' }).click()
  await settled()
  await expect(page.getByRole('textbox', { name: 'Your revised answer' })).toBeFocused()
})

test('teach-back: the input keeps focus while Sam replies; results take focus once', async ({
  page,
}) => {
  await signInSample(page)
  await openPractice(page, 'Teach-back')

  const input = page.getByRole('textbox', { name: 'Your explanation' })
  const samReplies = page
    .getByRole('list', { name: 'Conversation with Sam' })
    .getByRole('listitem')
    .filter({ hasText: 'Sam:' })
  const explain = async (text: string) => {
    const before = await samReplies.count()
    await input.fill(text)
    await input.press('Enter')
    await expect(samReplies).toHaveCount(before + 1)
    await expect(input).toBeEnabled()
    await expect(input).toBeFocused()
  }

  await explain('A pointer is a variable that stores the memory address of another value.')
  await page.getByRole('button', { name: "I'm done explaining" }).click()
  await expect(page.getByRole('heading', { name: 'How your explanation landed' })).toBeFocused()

  await explain('Dereferencing with * follows the address to read or change the value there.')
  await page.getByRole('button', { name: 'Submit my second try' }).click()
  const verdict = page.getByRole('heading', { name: /you taught it|getting there|not quite yet/i })
  await expect(verdict).toBeFocused()

  // Reopened later: the verdict shows, but focus starts at the top of the page as usual.
  await page.reload()
  await expect(verdict).toBeVisible()
  await expect(verdict).not.toBeFocused()
})

test('a missing lecture offers a way back instead of a retry', async ({ page }) => {
  await signInSample(page)
  await page.goto('/lectures/01900000-0000-7000-8000-000000000000')
  await expect(page.getByRole('link', { name: 'Back to Home' })).toBeVisible()
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
