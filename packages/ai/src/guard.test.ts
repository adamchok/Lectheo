import { describe, expect, it, vi } from 'vitest'
import {
  checkLeak,
  GUARD_BLOCK_ABOVE,
  GUARD_PASS_BELOW,
  keywordHit,
  type GuardContext,
  type JevScores,
  type LeakCheckInput,
} from './guard'
import { MODEL_SLUGS } from './models'
import { jsonResult, scriptedModel } from './test-utils'
import type { LlmCallEntry } from './types'

const INPUT: LeakCheckInput = {
  scenarioSentences: [
    'A pointer stores an address.',
    'malloc returns memory on the stack.',
    'You must free it later.',
  ],
  flawSentenceIdx: 1,
  flawSummary: 'malloc allocates on the heap',
  correction: 'malloc returns heap memory',
  leakKeywords: ['heap'],
  reply: 'I wrote it that way because that is what malloc does. What do you think?',
}

function ctx(extra: Partial<GuardContext> = {}): GuardContext & { entries: LlmCallEntry[] } {
  const entries: LlmCallEntry[] = []
  return {
    entries,
    fake: false,
    hooks: { logCall: async (e) => void entries.push(e) },
    ...extra,
  }
}

const scores =
  (revealsLocation: number, revealsCorrection: number) => async (): Promise<JevScores> => ({
    revealsLocation,
    revealsCorrection,
  })

describe('keywordHit()', () => {
  it('matches whole terms case-insensitively', () => {
    expect(keywordHit('It lives on the HEAP.', ['heap'])).toBe(true)
    expect(keywordHit('a heapsort is different', ['heap'])).toBe(false)
    expect(keywordHit('x <= y', ['<='])).toBe(true)
    expect(keywordHit('anything', [])).toBe(false)
  })
})

describe('checkLeak()', () => {
  it('keyword hit blocks without calling Jev', async () => {
    const evaluate = vi.fn(scores(0, 0))
    const res = await checkLeak({ ...INPUT, reply: 'It is on the heap.' }, ctx({ evaluate }))
    expect(res.decision).toBe('block')
    expect(res.guard.regexHit).toBe(true)
    expect(evaluate).not.toHaveBeenCalled()
  })

  it(`p < ${GUARD_PASS_BELOW} passes`, async () => {
    const escalate = vi.fn()
    const res = await checkLeak(INPUT, ctx({ evaluate: scores(0.1, 0.25), escalate }))
    expect(res.decision).toBe('pass')
    expect(res.guard.jev).toMatchObject({
      revealsLocation: 0.1,
      revealsCorrection: 0.25,
      maxP: 0.25,
    })
    expect(escalate).not.toHaveBeenCalled()
  })

  it(`p > ${GUARD_BLOCK_ABOVE} blocks (max of both questions)`, async () => {
    const escalate = vi.fn()
    const res = await checkLeak(INPUT, ctx({ evaluate: scores(0.05, 0.9), escalate }))
    expect(res.decision).toBe('block')
    expect(res.guard.escalated).toBe(false)
    expect(escalate).not.toHaveBeenCalled()
  })

  it('gray zone escalates and follows the escalation verdict', async () => {
    const leaks = await checkLeak(
      INPUT,
      ctx({ evaluate: scores(0.5, 0.1), escalate: async () => ({ leaks: true, reason: 'hints' }) }),
    )
    expect(leaks).toMatchObject({ decision: 'block', reason: 'hints' })
    expect(leaks.guard).toMatchObject({ escalated: true, escalationVerdict: true })

    const clean = await checkLeak(
      INPUT,
      ctx({ evaluate: scores(0.5, 0.1), escalate: async () => ({ leaks: false, reason: 'ok' }) }),
    )
    expect(clean.decision).toBe('pass')
    expect(clean.guard.escalationVerdict).toBe(false)
  })

  it('Jev timeout → escalation (jev recorded as null)', async () => {
    const slow = (_i: LeakCheckInput, signal: AbortSignal) =>
      new Promise<JevScores>((resolve, reject) => {
        const t = setTimeout(() => resolve({ revealsLocation: 0, revealsCorrection: 0 }), 1_000)
        signal.addEventListener('abort', () => {
          clearTimeout(t)
          reject(new Error('aborted'))
        })
      })
    const escalate = vi.fn(async () => ({ leaks: false, reason: 'fine' }))
    const res = await checkLeak(INPUT, ctx({ evaluate: slow, escalate, jevTimeoutMs: 20 }))
    expect(escalate).toHaveBeenCalledOnce()
    expect(res.decision).toBe('pass')
    expect(res.guard).toMatchObject({ jev: null, escalated: true })
  })

  it('Jev error → escalation; escalation failure → block (fail closed)', async () => {
    const res = await checkLeak(
      INPUT,
      ctx({
        evaluate: async () => {
          throw new Error('jev down')
        },
        escalate: async () => {
          throw new Error('luna down')
        },
      }),
    )
    expect(res.decision).toBe('block')
    expect(res.guard).toMatchObject({ jev: null, escalated: true, escalationVerdict: null })
  })

  it('default escalation runs the leak-escalation task on GPT-6 Luna via runTask', async () => {
    const luna = scriptedModel('luna', [jsonResult({ leaks: true, reason: 'restates the fix' })])
    const c = ctx({
      evaluate: scores(0.5, 0.5),
      retryDelayMs: 0,
      resolveModel: (slug) => {
        if (slug !== MODEL_SLUGS.luna) throw new Error(`unexpected ${slug}`)
        return luna
      },
    })
    const res = await checkLeak(INPUT, c)
    expect(res).toMatchObject({ decision: 'block', reason: 'restates the fix' })
    expect(luna.doGenerateCalls[0]?.reasoning).toBe('low')
    expect(c.entries[0]).toMatchObject({
      task: 'leak-escalation',
      role: 'guard-escalation',
      model: MODEL_SLUGS.luna,
      outcome: 'ok',
    })
  })

  it('fake mode is keyword-only', async () => {
    const evaluate = vi.fn(scores(1, 1))
    const res = await checkLeak(INPUT, ctx({ fake: true, evaluate }))
    expect(res.decision).toBe('pass')
    expect(evaluate).not.toHaveBeenCalled()
  })
})
