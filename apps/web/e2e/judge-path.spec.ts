import { expect, test, type Page } from '@playwright/test'
import { closeDb } from '@lectheo/db'
import { correctOptionId, LIBRARY_COURSE_ID, lectureId, signInSample, silentWav } from './fixtures'

// The answer-key lookup opens a DB pool; close it so the worker can exit.
test.afterAll(closeDb)

/*
 * The judge path (Product Spec §4.1, Architecture §1 goal 1) with AI_FAKE=1. Each test signs in
 * its own sample account. Assertions lean on stable things only: seed ids, the concept name
 * "Pointers", "Lecture 5" titles and the sample student story — never on question text.
 */

const L5 = lectureId('l5')
const MAX_DIAGNOSTIC_QUESTIONS = 20

test('sample sign-in lands on a dashboard pointing at Lecture 5', async ({ page }) => {
  await signInSample(page)

  const nextStep = page.getByRole('region', { name: /lecture 5/i })
  await expect(nextStep).toBeVisible()
  await expect(nextStep.getByRole('link', { name: /start watching/i })).toHaveAttribute(
    'href',
    `/lectures/${L5}/watch`,
  )
  // Seed story: Pointers is red with a confident mistake from the Lecture 4 diagnostic.
  const l4 = page.getByRole('listitem').filter({ hasText: /lecture 4/i })
  await expect(l4.getByText(/1 confident mistake/)).toBeVisible()
})

test('watch Lecture 5: player, transcript, markers with undo persist after reload', async ({
  page,
}) => {
  // No external media: block YouTube (forces the MP3 fallback) and serve the MP3 as local silence.
  await page.route(/youtube\.com|youtube-nocookie\.com|ytimg\.com/, (route) => route.abort())
  await page.route(/cdn\.cs50\.net\/.*\.mp3$/, (route) =>
    route.fulfill({ contentType: 'audio/wav', body: silentWav() }),
  )
  await signInSample(page)
  await page.getByRole('link', { name: /start watching/i }).click()
  await expect(page).toHaveURL(new RegExp(`/lectures/${L5}/watch$`))

  await expect(page.locator('audio')).toBeAttached()
  const transcript = page.getByRole('region', { name: 'Transcript' })
  await expect(transcript.getByRole('listitem').first()).toBeVisible()

  const lost = page.getByRole('button', { name: /i'm lost/i })
  const important = page.getByRole('button', { name: /^important/i })
  await expect(lost).toBeEnabled({ timeout: 45_000 }) // player ready
  await lost.click()
  await important.click()
  await expect(page.getByText(/^1 lost$/)).toBeVisible()
  await expect(page.getByText(/^1 important$/)).toBeVisible()

  await page
    .getByRole('listitem')
    .filter({ hasText: 'Marked: important' })
    .getByRole('button', { name: 'Undo' })
    .click()
  await expect(page.getByText(/^0 important$/)).toBeVisible()

  const saved = page.waitForResponse(
    (r) => r.url().endsWith(`/lectures/${L5}/markers`) && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: /done watching/i }).click()
  expect((await saved).ok()).toBe(true)
  await expect(page.getByRole('link', { name: /take the diagnostic/i })).toBeVisible()

  await page.reload()
  await expect(page.getByText(/^1 lost$/)).toBeVisible()
  await expect(page.getByText(/^0 important$/)).toBeVisible()
})

/** Rates "Sure", then picks a wrong option (answer key from the DB) and moves on. */
async function answerSureAndWrong(page: Page): Promise<void> {
  const question = page.getByRole('region', { name: 'Question' })
  const confidence = page.waitForResponse(
    (r) => r.url().endsWith('/confidence') && r.request().method() === 'POST',
  )
  await question.getByRole('radio', { name: /^sure/i }).click()
  const response = await confidence
  const itemId = new URL(response.url()).pathname.split('/').at(-2) ?? ''
  const { options } = (await response.json()) as { options: { id: string }[] }
  const correct = await correctOptionId(itemId)
  const wrong = options.findIndex((option) => option.id !== correct)

  await question
    .getByRole('list', { name: 'Answer options' })
    .getByRole('button')
    .nth(wrong)
    .click()
  await expect(question.getByText(/^not quite/i)).toBeVisible()
  await question
    .getByRole('button', { name: /one more on this idea|next question|see results/i })
    .click()
}

test('diagnostic for Lecture 5: results per concept, confident mistake → practice', async ({
  page,
}) => {
  await signInSample(page)
  await page.goto(`/lectures/${L5}/diagnostic`)

  const results = page.getByRole('heading', { name: 'Your results' })
  const question = page.getByRole('region', { name: 'Question' })
  for (let i = 0; i < MAX_DIAGNOSTIC_QUESTIONS; i += 1) {
    await expect(question.or(results)).toBeVisible()
    if (await results.isVisible()) break
    await answerSureAndWrong(page)
  }
  await expect(results).toBeVisible()
  await expect(page.getByText(/\d+ questions · [1-9]\d* confident mistakes?/)).toBeVisible()

  await page.getByRole('button', { name: /practice this/i }).click()
  await expect(page).toHaveURL(/\/activities\/[^/?]+\?from=red$/)
  await expect(page.getByRole('heading', { name: /does this explanation hold up/i })).toBeVisible()
})

/** Opens the library concept map and the Pointers node panel. */
async function openPointers(page: Page) {
  await page.getByRole('link', { name: 'Concept map', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/courses/${LIBRARY_COURSE_ID}$`))
  // "Pointers…": the library-bank seed may lengthen the name ("Pointers and dereferencing").
  const pointers = page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i })
  await pointers.click()
  const panel = page.getByRole('complementary', { name: /^pointers\b/i })
  await expect(panel).toBeVisible()
  return panel
}

test('concept map: laid-out nodes, Pointers red, spot the flaw from the panel', async ({
  page,
}) => {
  await signInSample(page)
  await page.getByRole('link', { name: 'Concept map', exact: true }).click()

  const nodes = page.locator('.react-flow__node')
  await expect(nodes.first()).toBeVisible()
  expect(await nodes.count()).toBeGreaterThan(3)
  // Stored ELK layout: nodes sit at distinct positions, not stacked at the origin.
  const [a, b] = await Promise.all([nodes.nth(0).boundingBox(), nodes.nth(1).boundingBox()])
  expect(a && b && (a.x !== b.x || a.y !== b.y)).toBe(true)

  await page.goto('/dashboard')
  const panel = await openPointers(page)
  await expect(panel.getByText('Needs work')).toBeVisible()
  await panel.getByRole('button', { name: 'Spot the flaw' }).click()

  await expect(page).toHaveURL(/\/activities\/[^/?]+\?from=red$/)
  await expect(page.getByRole('heading', { name: /does this explanation hold up/i })).toBeVisible()
  await page.getByRole('radio', { name: 'Correct' }).check({ force: true })
  await page.getByRole('button', { name: 'Submit' }).click()

  const result = page.getByRole('region', { name: 'Result' })
  await expect(result.getByText(/try 1 of 2/i)).toBeVisible()
  await expect(result.getByText(/^\d+\/\d+$/).first()).toBeVisible() // overall score
})

test('teach-back: streamed reply from Sam, judged, retry then reveal', async ({ page }) => {
  await signInSample(page)
  const panel = await openPointers(page)
  await panel.getByRole('button', { name: 'Teach-back' }).click()
  await expect(page).toHaveURL(/\/activities\/[^/?]+\?from=red$/)

  const chat = page.getByRole('list', { name: 'Conversation with Sam' })
  const samReplies = chat.getByRole('listitem').filter({ hasText: 'Sam:' })
  const input = page.getByRole('textbox', { name: 'Your explanation' })
  const explain = async (text: string) => {
    const before = await samReplies.count()
    await input.fill(text)
    await input.press('Enter')
    await expect(samReplies).toHaveCount(before + 1)
    await expect(input).toBeEnabled()
  }

  await expect(input).toBeEnabled()
  await explain('A pointer is a variable that stores the memory address of another value.')
  await page.getByRole('button', { name: "I'm done explaining" }).click()

  const tryOne = page.getByRole('region', { name: 'How your explanation landed' })
  const final = page.getByRole('region', { name: /you taught it|getting there|not quite yet/i })
  await expect(tryOne.or(final)).toBeVisible()
  if (await tryOne.isVisible()) {
    await explain('Dereferencing with * follows the address to read or change the value there.')
    await page.getByRole('button', { name: 'Submit my second try' }).click()
  }
  await expect(final).toBeVisible()
  await expect(final.getByRole('heading', { name: 'Key points' })).toBeVisible()
})

test('sign out: sample data is gone', async ({ page }) => {
  await signInSample(page)
  await page.getByRole('button', { name: /^account:/i }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('button', { name: /explore with a sample account/i })).toBeVisible()

  expect((await page.request.get('/api/v1/me')).status()).toBe(401)
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: /welcome back/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /start watching/i })).toHaveCount(0)
})
