import { createTestDb } from '@lectheo/db/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbLike } from '@/server/db'

vi.mock('server-only', () => ({}))
const deferred: (() => Promise<void>)[] = []
vi.mock('next/server', async (orig) => ({
  ...(await orig<typeof import('next/server')>()),
  after: (fn: () => Promise<void>) => deferred.push(fn),
}))
vi.mock('@/server/auth', () => ({ getActor: async () => null, requireActor: async () => null }))
let db: DbLike
vi.mock('@/server/db', async (orig) => ({
  ...(await orig<typeof import('@/server/db')>()),
  appDb: () => db,
}))
vi.mock('@/server/turnstile', async (orig) => ({
  ...(await orig<typeof import('@/server/turnstile')>()),
  verifyTurnstile: async () => {},
}))
const deleteUser = vi.fn()
vi.mock('@/server/supabase', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signInAnonymously: async () => ({ data: { user: { id: crypto.randomUUID() } } }) },
  }),
  supabaseAdmin: () => ({ auth: { admin: { deleteUser } } }),
}))
const purgeSampleAccounts = vi.fn()
vi.mock('@/server/sample', () => ({
  createSampleAccount: async () => {},
  purgeSampleAccounts: (d: DbLike) => purgeSampleAccounts(d),
}))

const { POST } = await import('./route')

const noParams = { params: Promise.resolve({}) }
const signIn = (ip: string) =>
  POST(
    new NextRequest('http://test/api/v1/session/sample', {
      method: 'POST',
      body: JSON.stringify({ turnstileToken: 'ok' }),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `${ip}, 10.0.0.1` },
    }),
    noParams,
  )

beforeEach(async () => {
  db = (await createTestDb()) as unknown as DbLike
  deferred.length = 0
  deleteUser.mockReset()
  purgeSampleAccounts.mockReset().mockResolvedValue(['old-sample'])
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('POST /api/v1/session/sample', () => {
  it('purges expired samples after responding, and only logs a purge failure (F0.6)', async () => {
    expect((await signIn('203.0.113.1')).status).toBe(200)
    expect(purgeSampleAccounts).not.toHaveBeenCalled()
    await Promise.all(deferred.map((fn) => fn()))
    expect(deleteUser).toHaveBeenCalledWith('old-sample')

    purgeSampleAccounts.mockRejectedValue(new Error('db down'))
    expect((await signIn('203.0.113.1')).status).toBe(200)
    await expect(Promise.all(deferred.map((fn) => fn()))).resolves.toBeDefined()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('sample_purge_failed'))
  })

  it('limits sign-ins per client IP (first x-forwarded-for hop) with 429', async () => {
    for (let i = 0; i < 5; i++) expect((await signIn('203.0.113.1')).status).toBe(200)
    const limited = await signIn('203.0.113.1')
    expect(limited.status).toBe(429)
    expect((await limited.json()).error.code).toBe('rate_limited')
    expect((await signIn('203.0.113.2')).status).toBe(200)
  })

  it('does not limit loopback (local dev)', async () => {
    for (let i = 0; i < 6; i++) expect((await signIn('::1')).status).toBe(200)
  })
})
