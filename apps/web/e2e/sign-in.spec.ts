import { expect, test, type Page } from '@playwright/test'
import { signInSample } from './fixtures'

/*
 * Sample sign-in when Cloudflare Turnstile can't load (blocked network, ad blocker). The widget's
 * own error-callback never fires without its script, so the button must recover by itself.
 */

const TURNSTILE = /challenges\.cloudflare\.com/

async function expectCheckFailed(page: Page): Promise<void> {
  // A held script can block the load event; the injected tag means the page has hydrated.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('script[src*="challenges.cloudflare.com"]', { state: 'attached' })
  const button = page.getByRole('button', { name: /explore with a sample account/i })
  await button.click()
  await expect(page.getByRole('status')).toContainText(/security check didn't load/i)
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
