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

const WAV_RATE = 8_000
const WAV_HEADER_BYTES = 44

/**
 * One second of silent 8-bit mono WAV, served in place of the lecture MP3 so the watch player
 * becomes ready offline. (Generated rather than committed: no binary fixture to keep.)
 */
export function silentWav(): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES)
  header.write('RIFF', 0)
  header.writeUInt32LE(WAV_HEADER_BYTES - 8 + WAV_RATE, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(WAV_RATE, 24) // sample rate
  header.writeUInt32LE(WAV_RATE, 28) // byte rate
  header.writeUInt16LE(1, 32) // block align
  header.writeUInt16LE(8, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(WAV_RATE, 40)
  return Buffer.concat([header, Buffer.alloc(WAV_RATE, 128)])
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
