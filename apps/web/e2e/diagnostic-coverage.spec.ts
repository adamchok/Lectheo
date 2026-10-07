import { expect, test, type Page } from '@playwright/test'
import { closeDb } from '@lectheo/db'
import { correctOptionId, lectureId, signInSample } from './fixtures'

// The answer-key lookup opens a DB pool; close it so the worker can exit.
test.afterAll(closeDb)

/*
 * Diagnostic coverage (Product Spec F3.9–F3.11) with AI_FAKE=1: a core round leaves concepts
 * untested, the results say how many, and "Test the other N" asks only about those.
 */

const L5 = lectureId('l5')
const MAX_QUESTIONS = 20

interface Planned {
  items: { conceptId: string }[]
}

/** Waits for the diagnostic start POST and returns the planned concepts. */
const plannedConcepts = (page: Page): Promise<Set<string>> =>
  page
    .waitForResponse(
      (r) => r.url().endsWith(`/lectures/${L5}/diagnostic`) && r.request().method() === 'POST',
    )
    .then(async (r) => new Set(((await r.json()) as Planned).items.map((i) => i.conceptId)))

/** Rates "Sure", picks the right option (no follow-up) and moves on, until the results show. */
async function answerAllRight(page: Page): Promise<void> {
  const results = page.getByRole('heading', { name: 'Your results' })
  const question = page.getByRole('region', { name: 'Question' })
  for (let i = 0; i < MAX_QUESTIONS; i += 1) {
    await expect(question.or(results)).toBeVisible()
    if (await results.isVisible()) return
    const confidence = page.waitForResponse(
      (r) => r.url().endsWith('/confidence') && r.request().method() === 'POST',
    )
    await question.getByRole('button', { name: /^sure/i }).click()
    const response = await confidence
    const itemId = new URL(response.url()).pathname.split('/').at(-2) ?? ''
    const { options } = (await response.json()) as { options: { id: string }[] }
    const correct = await correctOptionId(itemId)
    await question
      .getByRole('list', { name: 'Answer options' })
      .getByRole('button')
      .nth(options.findIndex((o) => o.id === correct))
      .click()
    await question.getByRole('button', { name: /next question|see results/i }).click()
  }
  await expect(results).toBeVisible()
}

test('coverage after a core round, then Test the rest asks only untested concepts', async ({
  page,
}) => {
  await signInSample(page)
  const corePlanned = plannedConcepts(page)
  await page.goto(`/lectures/${L5}/diagnostic`)
  const core = await corePlanned
  await answerAllRight(page)

  const coverage = page.getByRole('region', { name: 'Coverage' })
  await expect(coverage.getByText(/^Tested \d+ of \d+ concepts$/)).toBeVisible()
  await expect(coverage.getByText(/^Chapter 1 · \d+ of \d+ tested$/)).toBeVisible()
  await expect(page.getByRole('link', { name: /see it on the map/i })).toBeVisible()

  const restPlanned = plannedConcepts(page)
  await page.getByRole('button', { name: /^test (the other \d+|8 more)/i }).click()
  await expect(page).toHaveURL(new RegExp(`/lectures/${L5}/diagnostic\\?round=rest$`))
  const rest = await restPlanned
  expect(rest.size).toBeGreaterThan(0)
  expect([...rest].filter((id) => core.has(id))).toEqual([])

  await answerAllRight(page)
  await expect(coverage.getByText(/^Tested \d+ of \d+ concepts$/)).toBeVisible()
})
