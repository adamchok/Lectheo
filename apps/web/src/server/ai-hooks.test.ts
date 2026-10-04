import { AiPausedError, pingTask, runTask } from '@lectheo/ai'
import { appFlags, llmCalls, profiles } from '@lectheo/db'
import { createTestDb } from '@lectheo/db/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aiContext, toApiError } from './ai-hooks'
import type { Actor } from './auth'
import type { DbLike } from './db'
import { ApiError } from './errors'

vi.mock('server-only', () => ({}))

const ACTOR: Actor = {
  userId: '0190a000-0000-7000-8000-000000000001',
  kind: 'sample',
  isSample: true,
}

let db: DbLike

beforeEach(async () => {
  db = (await createTestDb()) as unknown as DbLike
  await db.insert(profiles).values({ id: ACTOR.userId, kind: 'sample' })
})

describe('aiContext', () => {
  it('logs one llm_calls row per runTask with the gateway key', async () => {
    const { output } = await runTask(pingTask, { word: 'lectheo' }, aiContext({ actor: ACTOR, db }))

    expect(output.echo).toBeTruthy()
    const rows = await db.select().from(llmCalls)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ task: 'ping', userId: ACTOR.userId, gatewayKey: 'dev' })
  })

  it('blocks the call with ai_paused when the governor flag is set', async () => {
    await db.update(appFlags).set({ aiDegraded: true })

    await expect(
      runTask(pingTask, { word: 'x' }, aiContext({ actor: ACTOR, db })),
    ).rejects.toMatchObject({ code: 'ai_paused' })
  })
})

describe('toApiError', () => {
  it('maps a gateway 402 to ai_paused and sets the sticky flag', async () => {
    const err = await toApiError(new AiPausedError(), db)

    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('ai_paused')
    const [flags] = await db.select().from(appFlags)
    expect(flags?.aiDegraded).toBe(true)
  })
})
