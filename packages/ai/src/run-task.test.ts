import { describe, expect, it } from 'vitest'
import { AiPausedError, FatalTaskError } from './errors'
import { MODEL_SLUGS } from './models'
import { runTask } from './run-task'
import { pingTask } from './tasks/ping/task'
import { apiError, jsonResult, recorder, scriptedModel, type MockModel } from './test-utils'

const GOOD = { echo: 'cs50', length: 4 }
const BAD_LENGTH = { echo: 'cs50', length: 5 }

function withModels(models: Record<string, MockModel>) {
  return (slug: string) => {
    const m = models[slug]
    if (!m) throw new Error(`unexpected model ${slug}`)
    return m
  }
}

describe('runTask — fake mode (AI_FAKE=1)', () => {
  it('returns the schema-parsed fake output and logs ok with cost 0', async () => {
    const rec = recorder()
    const res = await runTask(pingTask, { word: 'cs50' }, rec.ctx({ fake: true }))
    expect(res.output).toEqual(GOOD)
    expect(res.model).toBe('fake')
    expect(rec.entries).toHaveLength(1)
    expect(rec.entries[0]).toMatchObject({
      task: 'ping',
      role: 'reasoner',
      promptVersion: 'ping@1',
      outcome: 'ok',
      costUsd: 0,
      userId: 'user-1',
      lectureId: 'lecture-1',
    })
  })

  it('honours AI_FAKE=1 from the environment', async () => {
    const rec = recorder()
    const prev = process.env['AI_FAKE']
    process.env['AI_FAKE'] = '1'
    try {
      const { fake: _ignored, ...ctx } = rec.ctx()
      const res = await runTask(pingTask, { word: 'x' }, ctx)
      expect(res.model).toBe('fake')
    } finally {
      if (prev === undefined) delete process.env['AI_FAKE']
      else process.env['AI_FAKE'] = prev
    }
  })
})

describe('runTask — mocked model', () => {
  it('happy path: structured output, usage incl. reasoning, gateway cost, outcome ok', async () => {
    const model = scriptedModel('sonnet', [jsonResult(GOOD, { cost: '0.0012', reasoning: 30 })])
    const rec = recorder()
    const res = await runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({ resolveModel: withModels({ [MODEL_SLUGS.sonnet]: model }) }),
    )
    expect(res.output).toEqual(GOOD)
    expect(res.outcome).toBe('ok')
    expect(res.model).toBe(MODEL_SLUGS.sonnet)
    expect(model.doGenerateCalls).toHaveLength(1)
    expect(model.doGenerateCalls[0]?.reasoning).toBe('low')
    expect(rec.entries[0]).toMatchObject({
      outcome: 'ok',
      model: MODEL_SLUGS.sonnet,
      inputTokens: 100,
      cachedTokens: 40,
      outputTokens: 50,
      costUsd: 0.0012,
    })
  })

  it('semantic failure → one repair call with the errors → logs repaired', async () => {
    const model = scriptedModel('sonnet', [
      jsonResult(BAD_LENGTH, { cost: '0.001' }),
      jsonResult(GOOD, { cost: '0.002' }),
    ])
    const rec = recorder()
    const res = await runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({ resolveModel: withModels({ [MODEL_SLUGS.sonnet]: model }) }),
    )
    expect(res.outcome).toBe('repaired')
    expect(res.output).toEqual(GOOD)
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('length must be 4')
    expect(rec.entries).toHaveLength(1)
    expect(rec.entries[0]?.outcome).toBe('repaired')
    expect(rec.entries[0]?.costUsd).toBeCloseTo(0.003)
    expect(rec.entries[0]?.inputTokens).toBe(200)
  })

  it('schema-invalid JSON also gets the repair call', async () => {
    const model = scriptedModel('sonnet', [jsonResult('{"echo": 42}'), jsonResult(GOOD)])
    const rec = recorder()
    const res = await runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({ resolveModel: withModels({ [MODEL_SLUGS.sonnet]: model }) }),
    )
    expect(res.outcome).toBe('repaired')
    expect(model.doGenerateCalls).toHaveLength(2)
  })

  it('repair still failing → FatalTaskError and a failed log entry', async () => {
    const model = scriptedModel('sonnet', [jsonResult(BAD_LENGTH)])
    const rec = recorder()
    const run = runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({ resolveModel: withModels({ [MODEL_SLUGS.sonnet]: model }) }),
    )
    await expect(run).rejects.toBeInstanceOf(FatalTaskError)
    await expect(run).rejects.toMatchObject({ retryable: false, task: 'ping' })
    expect(model.doGenerateCalls).toHaveLength(2)
    expect(rec.entries.map((e) => e.outcome)).toEqual(['failed'])
  })

  it('budget hook throwing → budget_blocked logged, no model call, hook error rethrown', async () => {
    const model = scriptedModel('sonnet', [jsonResult(GOOD)])
    const rec = recorder()
    const paused = new Error('ai_paused')
    const run = runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({
        resolveModel: withModels({ [MODEL_SLUGS.sonnet]: model }),
        hooks: {
          checkBudget: async () => {
            throw paused
          },
        },
      }),
    )
    await expect(run).rejects.toBe(paused)
    expect(model.doGenerateCalls).toHaveLength(0)
    expect(rec.entries.map((e) => e.outcome)).toEqual(['budget_blocked'])
  })

  it('quota hook throwing → quota_blocked logged, no model call', async () => {
    const model = scriptedModel('sonnet', [jsonResult(GOOD)])
    const rec = recorder()
    const run = runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({
        resolveModel: withModels({ [MODEL_SLUGS.sonnet]: model }),
        hooks: {
          consumeQuota: async () => {
            throw new Error('quota_exceeded')
          },
        },
      }),
    )
    await expect(run).rejects.toThrow('quota_exceeded')
    expect(model.doGenerateCalls).toHaveLength(0)
    expect(rec.entries.map((e) => e.outcome)).toEqual(['quota_blocked'])
  })

  it('transient errors: 1 retry on the primary, then the role fallback model', async () => {
    const primary = scriptedModel('sonnet', [apiError(503)])
    const fallback = scriptedModel('flash', [jsonResult(GOOD)])
    const rec = recorder()
    const res = await runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({
        resolveModel: withModels({
          [MODEL_SLUGS.sonnet]: primary,
          [MODEL_SLUGS.geminiFlash]: fallback,
        }),
      }),
    )
    expect(primary.doGenerateCalls).toHaveLength(2)
    expect(fallback.doGenerateCalls).toHaveLength(1)
    expect(res.model).toBe(MODEL_SLUGS.geminiFlash)
    expect(rec.entries[0]).toMatchObject({ outcome: 'ok', model: MODEL_SLUGS.geminiFlash })
  })

  it('429 then success stays on the primary', async () => {
    const primary = scriptedModel('sonnet', [apiError(429), jsonResult(GOOD)])
    const rec = recorder()
    const res = await runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({ resolveModel: withModels({ [MODEL_SLUGS.sonnet]: primary }) }),
    )
    expect(res.model).toBe(MODEL_SLUGS.sonnet)
    expect(primary.doGenerateCalls).toHaveLength(2)
  })

  it('gateway 402 → AiPausedError, logged as budget_blocked, no fallback', async () => {
    const primary = scriptedModel('sonnet', [apiError(402)])
    const fallback = scriptedModel('flash', [jsonResult(GOOD)])
    const rec = recorder()
    const run = runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({
        resolveModel: withModels({
          [MODEL_SLUGS.sonnet]: primary,
          [MODEL_SLUGS.geminiFlash]: fallback,
        }),
      }),
    )
    await expect(run).rejects.toBeInstanceOf(AiPausedError)
    expect(fallback.doGenerateCalls).toHaveLength(0)
    expect(rec.entries.map((e) => e.outcome)).toEqual(['budget_blocked'])
  })

  it('non-transient errors (400) are thrown at once without fallback', async () => {
    const primary = scriptedModel('sonnet', [apiError(400)])
    const rec = recorder()
    const run = runTask(
      pingTask,
      { word: 'cs50' },
      rec.ctx({ resolveModel: withModels({ [MODEL_SLUGS.sonnet]: primary }) }),
    )
    await expect(run).rejects.toThrow('HTTP 400')
    expect(primary.doGenerateCalls).toHaveLength(1)
    expect(rec.entries.map((e) => e.outcome)).toEqual(['failed'])
  })
})
