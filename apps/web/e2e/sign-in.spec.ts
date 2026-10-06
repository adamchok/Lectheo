import { expect, test, type Page } from '@playwright/test'
import { dropProfile, heroSampleButton, landingHero, signInSample } from './fixtures'

/*
 * Sample sign-in when Cloudflare Turnstile can't load (blocked network, ad blocker). The widget's
 * own error-callback never fires without its script, so the button must recover by itself.
 */

const TURNSTILE = /challenges\.cloudflare\.com/

async function expectCheckFailed(page: Page): Promise<void> {
  // A held script can block the load event; the injected tag means the page has hydrated.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('script[src*="challenges.cloudflare.com"]', { state: 'attached' })
  const button = heroSampleButton(page)
  await button.click()
  await expect(landingHero(page).getByRole('status')).toContainText(/security check didn't load/i)
  await expect(button).toBeEnabled()
}

test('a blocked security check shows an error and re-enables the button', async ({ page }) => {
  await page.route(TURNSTILE, (route) => route.abort())
  await expectCheckFailed(page)
})

test('a security check that never loads times out with the same error', async ({ page }) => {
  // Hold the request open: the script neither loads nor errors.
  await page.route(TURNSTILE, () => new Promise<void>(() => {}))
  await expectCheckFailed(page)
})

test('a signed-in visitor on the landing page goes to the dashboard (F0.2)', async ({ page }) => {
  await signInSample(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('a session whose sample profile was purged is signed out, not looped (F0.2, F0.6)', async ({
  page,
}) => {
  await signInSample(page)
  const me = (await (await page.request.get('/api/v1/me')).json()) as { id: string }
  await dropProfile(me.id)

  await page.goto('/')
  await expect(heroSampleButton(page)).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
  expect((await page.request.get('/api/v1/me')).status()).toBe(401)
  // The session cookie is gone: the proxy no longer sends `/` to the dashboard.
  await page.reload()
  await expect(page).toHaveURL(/\/$/)
})

test('a failed Google round trip shows an inline alert and cleans the URL', async ({ page }) => {
  await page.goto('/?error=auth')
  await expect(landingHero(page).getByRole('alert')).toHaveText(
    "Google sign-in didn't complete. Try again.",
  )
  await expect(page).toHaveURL(/\/$/)
})

test('one sign-in at a time: the header check disables the hero buttons', async ({ page }) => {
  // Hold the script so the header's check stays on "Checking your browser…".
  await page.route(TURNSTILE, () => new Promise<void>(() => {}))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('script[src*="challenges.cloudflare.com"]', { state: 'attached' })
  await page
    .getByRole('banner')
    .getByRole('button', { name: /try the sample account/i })
    .click()
  await expect(page.getByRole('banner').getByText('Checking your browser…')).toBeVisible()
  await expect(heroSampleButton(page)).toBeDisabled()
  await expect(
    landingHero(page).getByRole('button', { name: /continue with google/i }),
  ).toBeDisabled()
})

test.describe('phone width', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('the menu closes after following a link, and on Escape', async ({ page }) => {
    await page.goto('/')
    const menu = page.getByRole('button', { name: 'Menu' })
    const practice = page.getByRole('navigation', { name: 'Sections, mobile' }).getByRole('link', {
      name: 'Practice',
    })
    await menu.click()
    await practice.click()
    await expect(practice).toBeHidden()
    await expect(page).toHaveURL(/#practice$/)

    await menu.click()
    await expect(practice).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(practice).toBeHidden()
  })
})
