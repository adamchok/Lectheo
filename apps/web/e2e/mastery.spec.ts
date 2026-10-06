import { expect, test, type Page } from '@playwright/test'
import { closeDb } from '@lectheo/db'
import { flawKeyOf, LIBRARY_COURSE_ID, signInSample } from './fixtures'

test.afterAll(closeDb)

/*
 * Judge path, end of §4.1: practice moves Pointers red → amber → green on the map, a finished
 * activity survives a reload, and Reset sample brings the seed story back. AI_FAKE=1: the fake
 * correction judge gives full marks and the fake referee accepts any question with a "?", so the
 * outcomes below are deterministic (the flaw key comes from the DB, never from seed text).
 */

const MAP = `/courses/${LIBRARY_COURSE_ID}`
const pointersNode = (page: Page, state: RegExp) =>
  page.getByRole('group', { name: new RegExp(`^pointers\\b[^,]*, ${state.source}`, 'i') })

async function openPointers(page: Page, state: RegExp) {
  await page.goto(MAP)
  await pointersNode(page, state).click()
  return page.getByRole('complementary', { name: /^pointers\b/i })
}

/** Try 1 wrong on purpose (wrong verdict), try 2 right: the Socratic retry stays independent. */
async function spotFlawWrongThenRight(page: Page): Promise<void> {
  const activityId = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  const key = await flawKeyOf(activityId)
  const submit = page.getByRole('button', { name: 'Submit' })

  if (key.hasFlaw) {
    await page.getByRole('radio', { name: 'No flaw' }).check({ force: true })
  } else {
    await page.getByRole('radio', { name: 'Flawed' }).check({ force: true })
    await page.getByRole('radio', { name: 'Sentence 1' }).check({ force: true })
    await page.getByRole('textbox', { name: /what should it say instead/i }).fill('It is wrong.')
  }
  await submit.click()
  const result = page.getByRole('region', { name: 'Result' })
  await expect(result.getByText(/try 1 of 2/i)).toBeVisible()
  await result.getByRole('button', { name: 'Retry' }).click()

  if (key.hasFlaw) {
    await page.getByRole('radio', { name: 'Flawed' }).check({ force: true })
    const sentence = (key.flawSentenceIdx ?? 0) + 1
    await page.getByRole('radio', { name: `Sentence ${sentence}` }).check({ force: true })
    await page
      .getByRole('textbox', { name: /what should it say instead/i })
      .fill('The pointer holds an address; dereferencing it reaches the value stored there.')
  } else {
    await page.getByRole('radio', { name: 'No flaw' }).check({ force: true })
  }
  await submit.click()
  await expect(result.getByText(/try 2 of 2/i)).toBeVisible()
}

test('practice turns Pointers red → amber → green; reload keeps results; reset restores', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signInSample(page)

  // Spot the flaw: wrong, Socratic retry, right → final reveal. Clears the confident mistake.
  let panel = await openPointers(page, /needs work/)
  await panel.getByRole('button', { name: 'Spot the flaw' }).click()
  await expect(page).toHaveURL(/\/activities\/[^/?]+\?from=red$/)
  await spotFlawWrongThenRight(page)
  const finished = page.url()
  const mastery = page.getByRole('heading', { name: /your mastery of this concept/i })
  await expect(page.getByRole('heading', { name: 'How it was graded' })).toBeVisible()
  await expect(mastery).toBeVisible()

  // A finished activity reloads as finished: final try, explanation, no answer form.
  // ponytail: the rubric list only comes from the submit response, so it isn't re-shown here.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Result' }).getByText(/try 2 of 2/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Explanation', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Submit' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)

  // One correct answer is never green (F6.2): Pointers is now amber.
  panel = await openPointers(page, /getting there/)
  await expect(panel.getByText('Getting there')).toBeVisible()

  // Stump the AI accepted = a second independent non-MCQ type → green.
  await panel.getByRole('button', { name: 'Stump the AI' }).click()
  await expect(page.getByRole('heading', { name: /can you stump the ai/i })).toBeVisible()
  await page
    .getByRole('textbox', { name: 'Your question' })
    .fill('Why does swap(int a, int b) leave the caller’s variables unchanged in C?')
  await page
    .getByRole('textbox', { name: 'Your answer key' })
    .fill('C passes copies; swap must take pointers (int *a, int *b) and dereference them.')
  await page.getByRole('button', { name: 'Submit to the referee' }).click()
  await expect(page.getByRole('region', { name: 'Result' }).getByText(/^Accepted/)).toBeVisible()

  panel = await openPointers(page, /mastered/)
  await expect(panel.getByText('Mastered')).toBeVisible()

  // Reset sample: back to the seed story (Pointers red), and the old activity is gone.
  await page.getByRole('button', { name: /^account:/i }).click()
  await page.getByRole('menuitem', { name: 'Reset sample' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset sample' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto(MAP)
  await expect(pointersNode(page, /needs work/)).toBeVisible()
  const finishedId = new URL(finished).pathname.split('/').at(-1)
  expect((await page.request.get(`/api/v1/activities/${finishedId}`)).status()).toBe(404)
})
