import { expect, type Page } from '@playwright/test'
import { getDb, sql } from '@lectheo/db'
import { e2eEnv } from './env'

export { LIBRARY_COURSE_ID, lectureId } from '@lectheo/db/seed'

/** Landing → "Explore with a sample account" (Turnstile test keys always pass) → dashboard. */
export async function signInSample(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: /explore with a sample account/i }).click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
}

/**
 * The correct option of a diagnostic item, read from the local DB. Tests use it to answer wrong
 * on purpose (a deterministic confident mistake) without depending on seed question text.
 */
export async function correctOptionId(itemId: string): Promise<string> {
  const db = getDb(e2eEnv().POSTGRES_URL)
  const rows = await db.execute<{ id: string }>(
    sql`select answer_key->>'correctOptionId' as id from item_secrets where item_id = ${itemId}`,
  )
  const id = rows[0]?.id
  if (!id) throw new Error(`no answer key for item ${itemId}`)
  return id
}
