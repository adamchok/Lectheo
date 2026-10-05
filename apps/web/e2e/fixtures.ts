import { expect, type Page } from '@playwright/test'
import { getDb, sql } from '@lectheo/db'
import { E2E_OFFLINE, e2eEnv } from './env'

export { LIBRARY_COURSE_ID, lectureId } from '@lectheo/db/seed'

/** Explicit-render Turnstile that passes on execute, like the always-pass test site key. */
const TURNSTILE_STUB = `window.turnstile = {
  render: (el, opts) => { window.__ts = opts; return 'e2e' },
  execute: () => setTimeout(() => window.__ts.callback('e2e-offline-token'), 0),
  reset: () => {}, remove: () => {},
}`

/** Landing → "Explore with a sample account" (Turnstile test keys always pass) → dashboard. */
export async function signInSample(page: Page): Promise<void> {
  if (E2E_OFFLINE) {
    await page.route(/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/, (route) =>
      route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }),
    )
  }
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

export interface FlawKey {
  hasFlaw: boolean
  flawSentenceIdx: number | null
}

/** The spot-the-flaw answer key of an activity's item, read from the local DB (like above). */
export async function flawKeyOf(activityId: string): Promise<FlawKey> {
  const db = getDb(e2eEnv().POSTGRES_URL)
  const rows = await db.execute<{ key: FlawKey }>(
    sql`select s.answer_key as key from activities a
        join item_secrets s on s.item_id = a.item_id where a.id = ${activityId}`,
  )
  const key = rows[0]?.key
  if (!key) throw new Error(`no flaw key for activity ${activityId}`)
  return key
}
