import { eq, lectures } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, ACTOR_B, ACTOR_S, createFixture, type Fixture, ID } from '../courses/test-fixtures'
import { assertUploadSize } from '../storage'
import { createAudioUpload, type SignAudioUpload } from './audio-upload'

vi.mock('server-only', () => ({}))
vi.mock('../supabase', () => ({}))

let f: Fixture
const AUDIO = '0190a000-0000-7000-8000-00000000c001'
const SAMPLE_AUDIO = '0190a000-0000-7000-8000-00000000c002'
const SAMPLE_COURSE = '0190a000-0000-7000-8000-00000000c0c5'
const MB = 1024 * 1024

// The real per-tier size check (storage.ts) with a fake signer instead of Supabase.
const sign: SignAudioUpload = async (actor, path, sizeBytes) => {
  assertUploadSize(actor, 'audio', sizeBytes)
  return { uploadUrl: `https://storage.test/${path}`, path, expiresAt: new Date().toISOString() }
}
const mp3 = (sizeBytes: number) => ({ contentType: 'audio/mpeg' as const, sizeBytes })

beforeEach(async () => {
  f = await createFixture()
  await f.exec(`
    INSERT INTO courses (id, kind, owner_id, title)
      VALUES ('${SAMPLE_COURSE}', 'personal', '${ID.S}', 'Sample');
    INSERT INTO lectures (id, course_id, title, seq, source, status) VALUES
      ('${AUDIO}', '${ID.P}', 'Week 3', 3, 'audio', 'draft'),
      ('${SAMPLE_AUDIO}', '${SAMPLE_COURSE}', 'Mine', 1, 'audio', 'draft');
  `)
})

describe('POST /lectures/{id}/audio-upload-url', () => {
  it('signs the upload and records audio_path', async () => {
    const res = await createAudioUpload(ACTOR_A, AUDIO, mp3(10 * MB), f.db, sign)
    expect(res.path).toBe(`${ID.A}/${AUDIO}`)
    const [row] = await f.db.select().from(lectures).where(eq(lectures.id, AUDIO))
    expect(row).toMatchObject({ audioPath: `${ID.A}/${AUDIO}`, status: 'uploading' })
  })

  it('limits sample accounts to 20 MB (403) and everyone to 50 MB (413)', async () => {
    await expect(
      createAudioUpload(ACTOR_S, SAMPLE_AUDIO, mp3(25 * MB), f.db, sign),
    ).rejects.toMatchObject({ code: 'sample_account_restricted', status: 403 })
    await expect(createAudioUpload(ACTOR_A, AUDIO, mp3(60 * MB), f.db, sign)).rejects.toMatchObject(
      { code: 'payload_too_large', status: 413 },
    )
  })

  it('404s other users; 409s transcript lectures and processing ones', async () => {
    await expect(createAudioUpload(ACTOR_B, AUDIO, mp3(MB), f.db, sign)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(createAudioUpload(ACTOR_A, ID.PL1, mp3(MB), f.db, sign)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    await f.exec(`UPDATE lectures SET status = 'processing' WHERE id = '${AUDIO}'`)
    await expect(createAudioUpload(ACTOR_A, AUDIO, mp3(MB), f.db, sign)).rejects.toMatchObject({
      code: 'invalid_state',
      status: 409,
    })
  })
})
