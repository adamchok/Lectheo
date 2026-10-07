import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { closeDb } from '@lectheo/db'
import { LIBRARY_COURSE_ID, signInSample } from './fixtures'

test.afterAll(closeDb)

/*
 * Course page layout (F2.10–F2.11): the map takes the full width, a node opens its panel as a
 * sheet over the map, Esc closes it and focus returns to the node, and Your markers sits below.
 * COURSE_SCREENSHOTS=1 also writes docs/audit/screenshots/course-v2/ (light + dark, 1440 and 375).
 */

const MAP = `/courses/${LIBRARY_COURSE_ID}`
const SHOTS = fileURLToPath(new URL('../../../docs/audit/screenshots/course-v2/', import.meta.url))

const pointersNode = (page: Page) =>
  page.getByRole('group', { name: /^pointers\b[^,]*, needs work/i })

test('node opens a sheet over the full-width map; Esc closes it; markers sit below', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signInSample(page)
  await page.goto(MAP)

  const canvas = page.locator('.react-flow')
  const markers = page.getByRole('region', { name: 'Your markers' })
  // Measure once the canvas replaced its loading skeleton.
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect(markers).toBeVisible()
  const [mapBox, markersBox] = await Promise.all([canvas.boundingBox(), markers.boundingBox()])
  // Full width: no 352px column beside the map; Your markers below it, as wide.
  expect(mapBox!.width).toBeGreaterThan(900)
  expect(markersBox!.y).toBeGreaterThan(mapBox!.y + mapBox!.height)
  expect(Math.abs(markersBox!.width - mapBox!.width)).toBeLessThan(4)
  // Each track shows its start and end time.
  await expect(markers.getByText(/^\d+:\d{2}(:\d{2})?$/).first()).toBeVisible()

  const node = pointersNode(page)
  await node.click()
  const panel = page.getByRole('complementary', { name: /^pointers\b/i })
  await expect(panel).toBeVisible()
  const panelBox = await panel.boundingBox()
  // A sheet over the map's right side, not a column beside it.
  expect(panelBox!.x).toBeGreaterThan(mapBox!.x + mapBox!.width / 2)
  expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(mapBox!.x + mapBox!.width)

  if (process.env.COURSE_SCREENSHOTS === '1') await capture(page)

  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(node).toBeFocused()

  await node.click()
  await panel.getByRole('button', { name: 'Close details' }).click()
  await expect(panel).toBeHidden()
  await expect(node).toBeFocused()

  // Esc on the open (selected) node itself: React Flow's own Esc must not blur it afterwards.
  await node.click()
  await expect(panel).toBeVisible()
  await node.focus()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await page.waitForTimeout(100)
  await expect(node).toBeFocused()

  // Esc from elsewhere (a timeline dot) closes the sheet without pulling focus back to the map.
  await node.click()
  await expect(panel).toBeVisible()
  const dot = markers.getByRole('link').first()
  await dot.focus()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  await expect(dot).toBeFocused()

  // Switching to the list and back doesn't reopen the sheet.
  await node.click()
  await expect(panel).toBeVisible()
  await page.getByRole('radio', { name: 'List' }).click()
  await page.getByRole('radio', { name: 'Map' }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  await expect(panel).toBeHidden()
})

/** Light and dark at 1440px and 375px, with the sheet open, then scrolled to Your markers. */
async function capture(page: Page): Promise<void> {
  const markers = page.getByRole('region', { name: 'Your markers' })
  const shot = (name: string) => page.screenshot({ path: `${SHOTS}${name}.png` })
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const [device, width, height] of [
      ['desktop', 1440, 900],
      ['phone', 375, 812],
    ] as const) {
      await page.setViewportSize({ width, height })
      await page.evaluate(() => window.scrollTo(0, 0))
      await shot(`${device}-${scheme}-sheet`)
      await markers.scrollIntoViewIfNeeded()
      await shot(`${device}-${scheme}-markers`)
    }
  }
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => window.scrollTo(0, 0))
}
