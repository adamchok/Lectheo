import { simulateReadableStream } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { MODEL_SLUGS } from './models'
import { streamPersona } from './stream-task'
import { friendReplyTask } from './tasks/friend-reply/task'
import { recorder } from './test-utils'

const INPUT = {
  conceptName: 'Pointers',
  history: [{ role: 'student' as const, text: 'A pointer is an address.' }],
  turn: 1,
  maxTurns: 6,
}

describe('streamPersona()', () => {
  it('fake mode streams the fake text deterministically and logs ok', async () => {
    const rec = recorder()
    const result = await streamPersona(friendReplyTask, INPUT, rec.ctx({ fake: true }))
    expect(await result.text).toBe(friendReplyTask.fakeText(INPUT))
    await result.consumeStream()
    expect(rec.entries).toEqual([
      expect.objectContaining({
        task: 'friend-reply',
        role: 'persona',
        model: 'fake',
        outcome: 'ok',
      }),
    ])
  })

  it('streams from the role model with the task effort override, token cap and gateway fallback', async () => {
    const model = new MockLanguageModelV4({
      modelId: MODEL_SLUGS.sonnet,
      doStream: async () => ({
        stream: simulateReadableStream({
          chunks: [
            { type: 'text-start', id: '1' },
            { type: 'text-delta', id: '1', delta: 'Why?' },
            { type: 'text-end', id: '1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              usage: {
                inputTokens: {
                  total: 50,
                  noCache: 50,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: { total: 9, text: 3, reasoning: 6 },
              },
              providerMetadata: { gateway: { cost: '0.0004' } },
            },
          ],
        }),
      }),
    })
    const rec = recorder()
    const result = await streamPersona(
      friendReplyTask,
      INPUT,
      rec.ctx({ resolveModel: () => model }),
    )
    expect(await result.text).toBe('Why?')
    await result.consumeStream()
    const call = model.doStreamCalls[0]
    expect(call?.reasoning).toBe('none')
    expect(call?.maxOutputTokens).toBe(600)
    expect(call?.providerOptions).toMatchObject({ gateway: { models: [MODEL_SLUGS.geminiFlash] } })
    expect(rec.entries[0]).toMatchObject({ outcome: 'ok', outputTokens: 9, costUsd: 0.0004 })
  })

  it('budget hook blocks before any stream starts', async () => {
    const rec = recorder()
    const run = streamPersona(
      friendReplyTask,
      INPUT,
      rec.ctx({
        fake: true,
        hooks: {
          checkBudget: async () => {
            throw new Error('ai_paused')
          },
        },
      }),
    )
    await expect(run).rejects.toThrow('ai_paused')
    expect(rec.entries.map((e) => e.outcome)).toEqual(['budget_blocked'])
  })
})
