import { asc, eq, lectures, transcriptSegments } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, ACTOR_B, ACTOR_S, createFixture, type Fixture, ID } from '../courses/test-fixtures'
import { readTranscriptRequest, type StoreTranscript, uploadTranscript } from './transcript-upload'

let f: Fixture
let store: ReturnType<typeof vi.fn<StoreTranscript>>
const DRAFT = '0190a000-0000-7000-8000-00000000b001'
const AUDIO = '0190a000-0000-7000-8000-00000000b002'
const SAMPLE_COURSE = '0190a000-0000-7000-8000-00000000b0c5'
const SAMPLE_DRAFT = '0190a000-0000-7000-8000-00000000b003'

const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
<v Prof. Malan>Hash tables map keys to buckets.

00:00:04.000 --> 00:00:09.500
<v Prof. Malan>Collisions are resolved by chaining.
`
const SRT = `1
00:00:01,000 --> 00:00:03,000
DAVID MALAN: Pointers hold addresses.

2
00:00:03,000 --> 00:00:06,000
DAVID MALAN: Dereferencing follows them.
`

const segments = () =>
  f.db
    .select()
    .from(transcriptSegments)
    .where(eq(transcriptSegments.lectureId, DRAFT))
    .orderBy(asc(transcriptSegments.idx))
const lecture = async (id = DRAFT) =>
  (await f.db.select().from(lectures).where(eq(lectures.id, id)))[0]

beforeEach(async () => {
  f = await createFixture()
  store = vi.fn<StoreTranscript>(async () => undefined)
  await f.exec(`
    INSERT INTO courses (id, kind, owner_id, title)
      VALUES ('${SAMPLE_COURSE}', 'personal', '${ID.S}', 'Sample');
    INSERT INTO lectures (id, course_id, title, seq, source, status) VALUES
      ('${DRAFT}', '${ID.P}', 'Week 3', 3, 'import', 'draft'),
      ('${AUDIO}', '${ID.P}', 'Week 4', 4, 'audio', 'draft'),
      ('${SAMPLE_DRAFT}', '${SAMPLE_COURSE}', 'Mine', 1, 'transcript', 'draft');
  `)
})

describe('POST /lectures/{id}/transcript', () => {
  it('parses VTT into segments, strips speakers, sets timestamps, keeps the raw file', async () => {
    const res = await uploadTranscript(ACTOR_A, DRAFT, { raw: VTT, ext: 'vtt' }, f.db, store)
    expect(res).toEqual({ segments: 1, hasTimestamps: true, durationMs: 9500, truncated: false })
    const rows = await segments()
    expect(rows[0]).toMatchObject({ idx: 0, startMs: 1000, endMs: 9500 })
    expect(rows.map((r) => r.text).join(' ')).not.toContain('Malan')
    expect(await lecture()).toMatchObject({ hasTimestamps: true, durationMs: 9500, status: 'draft' })
    expect(store).toHaveBeenCalledWith(`${ID.A}/${DRAFT}.vtt`, VTT, 'text/vtt')
  })

  it('parses SRT and strips "NAME:" labels; a re-upload replaces the segments', async () => {
    await uploadTranscript(ACTOR_A, DRAFT, { raw: VTT, ext: 'vtt' }, f.db, store)
    const res = await uploadTranscript(ACTOR_A, DRAFT, { raw: SRT, ext: 'srt' }, f.db, store)
    expect(res).toMatchObject({ hasTimestamps: true, durationMs: 6000 })
    const text = (await segments()).map((r) => r.text).join(' ')
    expect(text).toContain('Pointers hold addresses.')
    expect(text).not.toMatch(/MALAN|Hash/)
  })

  it('plain text → no timestamps, null duration, speakers stripped', async () => {
    const raw = 'Alice: Mitosis splits a cell.\n\nAlice: Meiosis makes gametes.'
    const res = await uploadTranscript(ACTOR_A, DRAFT, { raw, ext: 'txt' }, f.db, store)
    expect(res).toMatchObject({ hasTimestamps: false, durationMs: null })
    expect((await segments()).map((r) => r.text).join(' ')).not.toContain('Alice')
    expect(await lecture()).toMatchObject({ hasTimestamps: false, durationMs: null })
  })

  it('untimed text keeps an import’s known duration', async () => {
    await f.exec(`UPDATE lectures SET duration_ms = 600000 WHERE id = '${DRAFT}'`)
    const res = await uploadTranscript(ACTOR_A, DRAFT, { raw: 'Some text.', ext: 'txt' }, f.db, store)
    expect(res).toMatchObject({ hasTimestamps: false, durationMs: 600_000 })
    expect(await lecture()).toMatchObject({ durationMs: 600_000 })
  })

  it('422s garbage: binary, empty captions, an .srt without cues', async () => {
    const inputs = [
      { raw: 'PK\u0000\u0003\u0000binary', ext: 'txt' as const },
      { raw: 'WEBVTT\n\n', ext: 'vtt' as const },
      { raw: 'just some words', ext: 'srt' as const },
    ]
    for (const input of inputs) {
      await expect(uploadTranscript(ACTOR_A, DRAFT, input, f.db, store)).rejects.toMatchObject({
        code: 'unprocessable_input',
        status: 422,
      })
    }
    expect(store).not.toHaveBeenCalled()
  })

  it('truncates to the sample tier and says so', async () => {
    const t = (m: number, s: number) =>
      `00:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.000`
    const cues = Array.from(
      { length: 40 },
      (_, i) => `${t(i, 0)} --> ${t(i, 30)}\nMinute ${i} sentence.`,
    )
    const raw = `WEBVTT\n\n${cues.join('\n\n')}\n`
    const res = await uploadTranscript(ACTOR_S, SAMPLE_DRAFT, { raw, ext: 'vtt' }, f.db, store)
    expect(res.truncated).toBe(true)
    expect(res.durationMs).toBeLessThanOrEqual(20 * 60_000)
  })

  it('404s other users and library lectures; 409s audio lectures and wrong status', async () => {
    const input = { raw: VTT, ext: 'vtt' as const }
    await expect(uploadTranscript(ACTOR_B, DRAFT, input, f.db, store)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(uploadTranscript(ACTOR_A, ID.L1, input, f.db, store)).rejects.toMatchObject({
      code: 'not_found',
    })
    await expect(uploadTranscript(ACTOR_A, AUDIO, input, f.db, store)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    await expect(uploadTranscript(ACTOR_A, ID.PL1, input, f.db, store)).rejects.toMatchObject({
      code: 'invalid_state',
      status: 409,
    })
  })
})

describe('readTranscriptRequest', () => {
  const multipart = (name: string, body: string) => {
    const form = new FormData()
    form.append('file', new File([body], name))
    return new Request('http://x', { method: 'POST', body: form })
  }

  it('reads multipart files and JSON text', async () => {
    expect(await readTranscriptRequest(multipart('w.VTT', VTT))).toEqual({ raw: VTT, ext: 'vtt' })
    const json = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    })
    expect(await readTranscriptRequest(json)).toEqual({ raw: 'hello', ext: 'txt' })
  })

  it('rejects an oversized body from Content-Length before reading it', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(3 * 1024 * 1024) },
      body: '{}',
    })
    await expect(readTranscriptRequest(req)).rejects.toMatchObject({ code: 'payload_too_large' })
  })

  it('rejects other extensions (422) and files over 2 MB (413)', async () => {
    await expect(readTranscriptRequest(multipart('w.pdf', 'x'))).rejects.toMatchObject({
      code: 'unprocessable_input',
    })
    await expect(
      readTranscriptRequest(multipart('w.txt', 'x'.repeat(2 * 1024 * 1024 + 1))),
    ).rejects.toMatchObject({ code: 'payload_too_large', status: 413 })
  })
})
