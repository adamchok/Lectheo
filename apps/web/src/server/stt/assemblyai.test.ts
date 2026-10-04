import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ID } from '../courses/test-fixtures'
import { createPipelineFixture, rows, type PipelineFixture } from '../pipeline/test-fixture'
import {
  fetchTranscriptStep,
  pollTranscriptionStep,
  submitTranscriptionStep,
} from '../pipeline/transcribe'
import { assemblyAiClient } from './assemblyai'

vi.mock('server-only', () => ({}))
const storage = vi.hoisted(() => ({
  createDownloadUrl: vi.fn(async () => 'https://storage.test/audio?token=x'),
  deleteObjects: vi.fn(async () => {}),
}))
vi.mock('../storage', async (orig) => ({
  ...(await orig<typeof import('../storage')>()),
  ...storage,
}))

type Scripted = { status?: number; body?: unknown }

/** A scripted AssemblyAI: each request takes the next response queued for its method + path. */
function fakeApi(script: Record<string, Scripted[]>) {
  const calls: string[] = []
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace('https://api.assemblyai.com/v2', '')
    const key = `${init?.method ?? 'GET'} ${path}`
    calls.push(key)
    const next = script[key]?.shift() ?? { status: 404 }
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 })
  })
  return { client: assemblyAiClient('test-key', fetchMock as typeof fetch), calls, fetchMock }
}

let f: PipelineFixture

beforeEach(async () => {
  f = await createPipelineFixture({ source: 'audio', segments: 0, audioPath: `${ID.A}/a1` })
  vi.clearAllMocks()
})

const sttJobId = async (): Promise<string | null | undefined> =>
  (
    await rows<{ stt_job_id: string | null }>(
      f,
      `SELECT stt_job_id FROM lectures WHERE id = '${f.lectureId}'`,
    )
  )[0]?.stt_job_id

describe('AssemblyAI client', () => {
  it('sends the key, the signed audio URL and the speech model', async () => {
    const api = fakeApi({ 'POST /transcript': [{ body: { id: 'job-1' } }] })
    await submitTranscriptionStep(f.db, f.lectureId, api.client)
    const [, init] = api.fetchMock.mock.calls[0] ?? []
    expect(init?.headers).toMatchObject({ authorization: 'test-key' })
    expect(JSON.parse(String(init?.body))).toEqual({
      audio_url: 'https://storage.test/audio?token=x',
      speech_model: 'universal-3-5-pro',
    })
  })

  it('submits once even when the step is retried', async () => {
    const api = fakeApi({
      'POST /transcript': [{ status: 500 }, { body: { id: 'job-1' } }, { body: { id: 'job-2' } }],
    })
    // Attempt 1: AssemblyAI 500 → retryable error, and the reservation is released.
    await expect(submitTranscriptionStep(f.db, f.lectureId, api.client)).rejects.toThrow(/500/)
    expect(await sttJobId()).toBeNull()
    // Attempt 2 submits; a retry after a crash (step not marked done) reuses the stored job.
    await expect(submitTranscriptionStep(f.db, f.lectureId, api.client)).resolves.toEqual({
      jobId: 'job-1',
    })
    await f.exec(`DELETE FROM pipeline_steps WHERE lecture_id = '${f.lectureId}'`)
    await expect(submitTranscriptionStep(f.db, f.lectureId, api.client)).resolves.toEqual({
      jobId: 'job-1',
    })
    expect(api.calls.filter((c) => c === 'POST /transcript')).toHaveLength(2)
    expect(await sttJobId()).toBe('job-1')
  })

  it('backs off while another attempt holds a fresh reservation', async () => {
    await f.exec(`UPDATE lectures SET stt_job_id = 'reserving:${Date.now()}'`)
    const api = fakeApi({ 'POST /transcript': [{ body: { id: 'job-1' } }] })
    await expect(submitTranscriptionStep(f.db, f.lectureId, api.client)).rejects.toThrow(
      /in progress/,
    )
    expect(api.calls).toEqual([])
  })

  it('polls to a terminal status', async () => {
    await f.exec(`UPDATE lectures SET stt_job_id = 'job-1'`)
    const api = fakeApi({
      'GET /transcript/job-1': [
        { body: { status: 'queued' } },
        { body: { status: 'processing' } },
        { body: { status: 'completed', audio_duration: 90 } },
      ],
    })
    const results: string[] = []
    for (let i = 0; i < 3; i++) {
      results.push(await pollTranscriptionStep(f.db, f.lectureId, api.client))
    }
    expect(results).toEqual(['pending', 'pending', 'completed'])
    // Done now: a replay doesn't call AssemblyAI again.
    expect(await pollTranscriptionStep(f.db, f.lectureId, api.client)).toBe('completed')
    expect(api.calls).toHaveLength(3)
  })

  it('fails the poll step without retries on a transcription error', async () => {
    await f.exec(`UPDATE lectures SET stt_job_id = 'job-1'`)
    const api = fakeApi({
      'GET /transcript/job-1': [{ body: { status: 'error', error: 'no speech' } }],
    })
    await expect(pollTranscriptionStep(f.db, f.lectureId, api.client)).rejects.toMatchObject({
      name: 'FatalError',
    })
    const [step] = await rows<{ status: string; output: unknown }>(
      f,
      `SELECT status, output FROM pipeline_steps WHERE step = 'pollTranscription'`,
    )
    expect(step).toMatchObject({ status: 'failed', output: { error: { code: 'stt_failed' } } })
  })

  it('writes segments, then deletes the remote transcript and the audio object', async () => {
    await f.exec(`UPDATE lectures SET stt_job_id = 'job-1'`)
    const api = fakeApi({
      'GET /transcript/job-1': [
        { body: { status: 'completed', audio_duration: 90, confidence: 0.9 } },
      ],
      'GET /transcript/job-1/sentences': [
        {
          body: {
            sentences: [
              { text: 'Pointers store addresses.', start: 0, end: 30_000 },
              { text: 'malloc returns heap memory.', start: 30_000, end: 90_000 },
            ],
          },
        },
      ],
      'DELETE /transcript/job-1': [{ body: {} }],
    })
    await fetchTranscriptStep(f.db, f.lectureId, api.client)
    expect(api.calls).toContain('DELETE /transcript/job-1')
    expect(storage.deleteObjects).toHaveBeenCalledWith('audio', [`${ID.A}/a1`])
    const [lecture] = await rows<{ audio_path: string | null; duration_ms: number }>(
      f,
      `SELECT audio_path, duration_ms FROM lectures WHERE id = '${f.lectureId}'`,
    )
    expect(lecture).toEqual({ audio_path: null, duration_ms: 90_000 })
    const segments = await rows<{ text: string }>(
      f,
      `SELECT text FROM transcript_segments WHERE lecture_id = '${f.lectureId}' ORDER BY idx`,
    )
    expect(segments.map((s) => s.text).join(' ')).toContain('malloc returns heap memory.')
  })

  it('keeps waiting through a transient poll error, but not an auth error', async () => {
    await f.exec(`UPDATE lectures SET stt_job_id = 'job-1'`)
    const api = fakeApi({
      'GET /transcript/job-1': [{ status: 503 }, { status: 429 }, { status: 401 }],
    })
    expect(await pollTranscriptionStep(f.db, f.lectureId, api.client)).toBe('pending')
    expect(await pollTranscriptionStep(f.db, f.lectureId, api.client)).toBe('pending')
    await expect(pollTranscriptionStep(f.db, f.lectureId, api.client)).rejects.toThrow(/401/)
  })

  it('deletes the remote job when transcription fails', async () => {
    await f.exec(`UPDATE lectures SET stt_job_id = 'job-1'`)
    const api = fakeApi({
      'GET /transcript/job-1': [{ body: { status: 'error', error: 'bad audio' } }],
      'DELETE /transcript/job-1': [{ body: {} }],
    })
    await f.exec(`INSERT INTO pipeline_steps (lecture_id, step, status, output)
      VALUES ('${f.lectureId}', 'submitTranscription', 'done', '{"jobId":"job-1"}')`)
    await expect(pollTranscriptionStep(f.db, f.lectureId, api.client)).rejects.toThrow()
    expect(api.calls).toContain('DELETE /transcript/job-1')
    // The deleted job is forgotten, so a resume re-submits the kept audio instead of polling it.
    expect(await sttJobId()).toBeNull()
    const resubmit = fakeApi({ 'POST /transcript': [{ body: { id: 'job-2' } }] })
    await expect(submitTranscriptionStep(f.db, f.lectureId, resubmit.client)).resolves.toEqual({
      jobId: 'job-2',
    })
  })

  it('treats an already-deleted remote transcript as deleted', async () => {
    const api = fakeApi({ 'DELETE /transcript/gone': [{ status: 404 }] })
    await expect(api.client.remove('gone')).resolves.toBeUndefined()
  })
})
