import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attemptPlan } from './call-model'
import { FatalTaskError } from './errors'
import { GOOGLE_API_BASE, GoogleHttpError } from './google-direct'
import { defineTask, runTask } from './run-task'
import { FAKE_SILENT_VIDEO_ID, transcribeChunkTask } from './tasks/transcribe-chunk/task'
import { TranscribeChunkOutput } from './tasks/transcribe-chunk/schema'
import { recorder } from './test-utils'

const INPUT = { videoId: '6Svu_ae5ebk', startMs: 4_350_000, endMs: 4_470_000 }
const CUES = { cues: [{ start: '1:12:31', end: '1:12:40', text: 'So today, pointers.' }] }
const USAGE = { promptTokenCount: 11_000, candidatesTokenCount: 1_200, thoughtsTokenCount: 300 }

const ok = (body: unknown = CUES): Response =>
  Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
    usageMetadata: USAGE,
  })
const status = (code: number): Response =>
  Response.json({ error: { message: `status ${code}` } }, { status: code })

/** A fetch that answers with the given responses in order (the last one repeats). */
function scriptedFetch(responses: readonly (() => Response)[]) {
  let call = 0
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = responses[Math.min(call, responses.length - 1)]
    call += 1
    if (!next) throw new Error('no scripted response')
    return next()
  })
}

/** Any gateway model resolution is a test failure: the transcriber must never use it. */
const noGateway = vi.fn(() => {
  throw new Error('the transcriber resolved a gateway model')
})

beforeEach(() => {
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', 'test-key')
  noGateway.mockClear()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('transcriber role: never the AI Gateway (ADR-017)', () => {
  it('has no gateway attempt plan', () => {
    expect(() => attemptPlan('transcriber')).toThrow(/never the AI Gateway/)
  })

  it('sends the clip to Google generateContent only, with the spike request shape', async () => {
    const fetch = scriptedFetch([() => ok()])
    const rec = recorder()
    const res = await runTask(
      transcribeChunkTask,
      INPUT,
      rec.ctx({ fetch, resolveModel: noGateway }),
    )

    expect(res.output).toEqual(CUES)
    expect(noGateway).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toBe(`${GOOGLE_API_BASE}/gemini-3.8-flash:generateContent`)
    expect(new URL(String(url)).host).toBe('generativelanguage.googleapis.com')
    const body = JSON.parse(String(init?.body))
    expect(body.contents[0].parts[0]).toEqual({
      fileData: { fileUri: 'https://www.youtube.com/watch?v=6Svu_ae5ebk', mimeType: 'video/mp4' },
      videoMetadata: { startOffset: '4350s', endOffset: '4470s' },
    })
    expect(body.contents[0].parts[1].text).toContain('between 1:12:30 and 1:14:30')
    expect(body.generationConfig).toMatchObject({
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      responseMimeType: 'application/json',
    })
  })

  it('a transcriber task without a Google request fails instead of falling back', async () => {
    const task = defineTask({ ...transcribeChunkTask, google: undefined })
    const fetch = scriptedFetch([() => ok()])
    const rec = recorder()
    await expect(runTask(task, INPUT, rec.ctx({ fetch, resolveModel: noGateway }))).rejects.toThrow(
      /no Google request/,
    )
    expect(noGateway).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(rec.entries.map((e) => e.outcome)).toEqual(['failed'])
  })
})

describe('transcriber: llm_calls logging', () => {
  it('logs one row with gateway_key google and list-price cost from usageMetadata', async () => {
    const rec = recorder()
    await runTask(transcribeChunkTask, INPUT, rec.ctx({ fetch: scriptedFetch([() => ok()]) }))
    expect(rec.entries).toHaveLength(1)
    expect(rec.entries[0]).toMatchObject({
      task: 'transcribeChunk',
      role: 'transcriber',
      model: 'gemini-3.8-flash',
      promptVersion: 'transcribe-chunk@1',
      gatewayKey: 'google',
      inputTokens: 11_000,
      outputTokens: 1_500,
      outcome: 'ok',
    })
    // 11k × $0.75/M + 1.5k × $3.75/M
    expect(rec.entries[0]?.costUsd).toBeCloseTo(0.013875, 6)
  })

  it('logs a blocked budget as budget_blocked with gateway_key google and no request', async () => {
    const fetch = scriptedFetch([() => ok()])
    const rec = recorder()
    const run = runTask(
      transcribeChunkTask,
      INPUT,
      rec.ctx({
        fetch,
        hooks: {
          checkBudget: async () => {
            throw new Error('intake_paused')
          },
        },
      }),
    )
    await expect(run).rejects.toThrow('intake_paused')
    expect(fetch).not.toHaveBeenCalled()
    expect(rec.entries[0]).toMatchObject({ outcome: 'budget_blocked', gatewayKey: 'google' })
  })
})

describe('transcriber: retries', () => {
  it('retries 429 and 503 with backoff, then succeeds', async () => {
    const fetch = scriptedFetch([() => status(429), () => status(503), () => ok()])
    const rec = recorder()
    const res = await runTask(transcribeChunkTask, INPUT, rec.ctx({ fetch }))
    expect(res.outcome).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('gives up after four 503s', async () => {
    const fetch = scriptedFetch([() => status(503)])
    const rec = recorder()
    await expect(runTask(transcribeChunkTask, INPUT, rec.ctx({ fetch }))).rejects.toBeInstanceOf(
      GoogleHttpError,
    )
    expect(fetch).toHaveBeenCalledTimes(4)
    expect(rec.entries.map((e) => e.outcome)).toEqual(['failed'])
  })

  it('does not retry a 400', async () => {
    const fetch = scriptedFetch([() => status(400)])
    const rec = recorder()
    await expect(runTask(transcribeChunkTask, INPUT, rec.ctx({ fetch }))).rejects.toThrow('400')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('re-asks once on unparsable output, then fails with summed usage', async () => {
    const garbage = () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: '{"cues": [' }] } }],
        usageMetadata: USAGE,
      })
    const fetch = scriptedFetch([garbage])
    const rec = recorder()
    await expect(runTask(transcribeChunkTask, INPUT, rec.ctx({ fetch }))).rejects.toBeInstanceOf(
      FatalTaskError,
    )
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(rec.entries[0]).toMatchObject({ outcome: 'failed', inputTokens: 22_000 })
  })

  it('a good second answer counts as repaired', async () => {
    const fetch = scriptedFetch([() => ok({ nope: true }), () => ok()])
    const rec = recorder()
    const res = await runTask(transcribeChunkTask, INPUT, rec.ctx({ fetch }))
    expect(res.outcome).toBe('repaired')
  })
})

describe('transcriber: AI_FAKE', () => {
  it('returns deterministic, schema-valid cues across the clip without a request', async () => {
    const fetch = scriptedFetch([() => ok()])
    const rec = recorder()
    const a = await runTask(transcribeChunkTask, INPUT, rec.ctx({ fake: true, fetch }))
    const b = await runTask(transcribeChunkTask, INPUT, rec.ctx({ fake: true, fetch }))
    expect(fetch).not.toHaveBeenCalled()
    expect(a.output).toEqual(b.output)
    expect(TranscribeChunkOutput.parse(a.output).cues).toHaveLength(8)
    expect(a.output.cues[0]?.start).toBe('1:12:30')
    expect(rec.entries[0]).toMatchObject({ model: 'fake', costUsd: 0, gatewayKey: 'google' })
  })

  it('has a silent video for the no-speech path', async () => {
    const rec = recorder()
    const res = await runTask(
      transcribeChunkTask,
      { ...INPUT, videoId: FAKE_SILENT_VIDEO_ID },
      rec.ctx({ fake: true }),
    )
    expect(res.output.cues).toEqual([])
  })
})
