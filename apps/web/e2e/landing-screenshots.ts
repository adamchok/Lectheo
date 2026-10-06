import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { v7 as uuidv7 } from 'uuid'
import { closeDb, getDb, sql } from '@lectheo/db'
import { e2eEnv } from './env'
import { correctOptionId, flawKeyOf, LIBRARY_COURSE_ID, lectureId, signInSample } from './fixtures'

/*
 * Landing page screenshots (Design System §5 Imagery: real app only, light and dark). Not part of
 * the e2e suite; run it on purpose, then commit the PNGs:
 *
 *   LANDING_SCREENSHOTS=1 pnpm --filter @lectheo/web e2e landing-screenshots
 *
 * It plays one sample student through the real app (AI_FAKE=1, local Supabase, like e2e):
 * the Lecture 5 diagnostic sure-and-wrong on hash tables only (a confident mistake), Spot the flaw
 * on arrays, linked lists and pointers (arrays and linked lists reach Mastered; pointers' seeded
 * confident mistake clears), then captures the result card and the course map.
 */

test.skip(!process.env.LANDING_SCREENSHOTS, 'set LANDING_SCREENSHOTS=1 to capture')
test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
test.afterAll(closeDb)

const OUT = new URL('../src/components/landing/screenshots/', import.meta.url)
const L5 = lectureId('l5')
const MAX_DIAGNOSTIC_QUESTIONS = 20
const WRONG_ON = 'hash_tables'
/** Inside Lecture 5's segment 50 ("a hash table … is going to be an array with linked lists"). */
const HASH_TABLES_MS = 6_400_000

async function conceptKeyOf(itemId: string): Promise<string> {
  const rows = await getDb(e2eEnv().POSTGRES_URL).execute<{ key: string }>(
    sql`select c.canonical_key as key from items i join concepts c on c.id = i.concept_id
        where i.id = ${itemId}`,
  )
  return rows[0]?.key ?? ''
}

/** Rates "Sure", answers (wrong only on hash tables) and moves on. */
async function answer(page: Page): Promise<void> {
  const question = page.getByRole('region', { name: 'Question' })
  const confidence = page.waitForResponse(
    (r) => r.url().endsWith('/confidence') && r.request().method() === 'POST',
  )
  await question.getByRole('button', { name: /^sure/i }).click()
  const response = await confidence
  const itemId = new URL(response.url()).pathname.split('/').at(-2) ?? ''
  const { options } = (await response.json()) as { options: { id: string }[] }
  const [correct, key] = await Promise.all([correctOptionId(itemId), conceptKeyOf(itemId)])
  // Right everywhere except hash tables.
  const pick = options.findIndex((option) => (option.id === correct) !== (key === WRONG_ON))

  await question.getByRole('list', { name: 'Answer options' }).getByRole('button').nth(pick).click()
  await question
    .getByRole('button', { name: /one more on this idea|next question|see results/i })
    .click()
}

/** Spot the flaw on a concept, answered right the first time (key from the DB). */
async function spotFlawRight(page: Page, concept: RegExp): Promise<void> {
  await page.goto(`/courses/${LIBRARY_COURSE_ID}`)
  await page.getByRole('group', { name: concept }).click()
  await page.getByRole('complementary').getByRole('button', { name: 'Spot the flaw' }).click()
  await expect(page).toHaveURL(/\/activities\//)

  const key = await flawKeyOf(new URL(page.url()).pathname.split('/').at(-1) ?? '')
  if (key.hasFlaw) {
    await page.getByRole('radio', { name: 'Flawed' }).check({ force: true })
    const sentence = (key.flawSentenceIdx ?? 0) + 1
    await page.getByRole('radio', { name: `Sentence ${sentence}` }).check({ force: true })
    await page
      .getByRole('textbox', { name: /what should it say instead/i })
      .fill('The corrected statement, as the lecture explains it.')
  } else {
    await page.getByRole('radio', { name: 'No flaw' }).check({ force: true })
  }
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('heading', { name: /your mastery of this concept/i })).toBeVisible()
}

/** Light then dark: next-themes follows the emulated system theme. */
async function capture(page: Page, target: Locator, name: string): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
    const path = fileURLToPath(new URL(`${name}-${theme}.png`, OUT))
    await target.screenshot({ path, animations: 'disabled' })
  }
  await page.emulateMedia({ colorScheme: 'light' })
}

test('capture the landing screenshots', async ({ page }) => {
  test.setTimeout(240_000)
  await signInSample(page)
  // "I'm lost" during the hash-table explanation, as pressing L while watching would save it:
  // the diagnostic then targets hash tables, and the map shows the flag.
  const marked = await page.request.post(`/api/v1/lectures/${L5}/markers`, {
    data: { markers: [{ id: uuidv7(), kind: 'lost', tMs: HASH_TABLES_MS, capture: 'watch' }] },
  })
  expect(marked.ok()).toBe(true)

  await page.goto(`/lectures/${L5}/diagnostic`)
  const results = page.getByRole('heading', { name: 'Your results' })
  const question = page.getByRole('region', { name: 'Question' })
  for (let i = 0; i < MAX_DIAGNOSTIC_QUESTIONS; i += 1) {
    await expect(question.or(results)).toBeVisible()
    if (await results.isVisible()) break
    await answer(page)
  }
  const card = page.locator('section[aria-labelledby="confident-mistake-title"]')
  await expect(card).toContainText(/hash tables/i)
  await capture(page, card, 'diagnostic-result')

  for (const concept of [/^arrays\b[^,]*,/i, /^linked lists\b[^,]*,/i, /^pointers\b[^,]*,/i]) {
    await spotFlawRight(page, concept)
  }

  await page.goto(`/courses/${LIBRARY_COURSE_ID}`)
  const hashTables = page.getByRole('group', { name: /^hash tables\b[^,]*, needs work/i })
  await expect(hashTables).toBeVisible()
  await expect(page.getByRole('group', { name: /^arrays\b[^,]*, mastered/i })).toBeVisible()
  await expect(page.getByRole('group', { name: /^linked lists\b[^,]*, mastered/i })).toBeVisible()
  await capture(page, page.getByRole('main'), 'hero-map')
})
