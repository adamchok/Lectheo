import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

vi.mock('server-only', () => ({}))
const requireActor = vi.fn()
vi.mock('./auth', () => ({ requireActor: () => requireActor() }))

const { ApiError, route } = await import('./http')

const ACTOR = { userId: '0190a000-0000-7000-8000-000000000001', kind: 'google', isSample: false }
const noParams = { params: Promise.resolve({}) }

const post = (body: string, url = 'http://test/api/v1/x') =>
  new NextRequest(url, { method: 'POST', body, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  requireActor.mockReset().mockResolvedValue(ACTOR)
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('route()', () => {
  it('parses the body and strips keys missing from the response schema', async () => {
    const handler = route(
      {
        auth: 'required',
        body: z.object({ n: z.number() }),
        response: z.object({ n: z.number() }),
      },
      async ({ body, actor }) => ({ n: body.n * 2, secret: 'answerKey', user: actor.userId }),
    )
    const res = await handler(post('{"n":2}'), noParams)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ n: 4 })
    expect(res.headers.get('x-request-id')).toMatch(/^req_[0-9a-f-]{36}$/)
  })

  it('answers 400 validation_failed with issues', async () => {
    const handler = route(
      { auth: 'required', body: z.object({ n: z.number() }), status: 204 },
      async () => {},
    )
    const res = await handler(post('{"n":"x"}'), noParams)
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('validation_failed')
    expect(error.details.issues[0].path).toBe('body.n')
    expect(error.requestId).toMatch(/^req_/)
  })

  it('rejects non-JSON bodies with 400', async () => {
    const handler = route({ auth: 'public', body: z.object({}), status: 204 }, async () => {})
    expect((await handler(post('{nope'), noParams)).status).toBe(400)
  })

  it('validates query and params', async () => {
    const handler = route(
      {
        auth: 'public',
        query: z.object({ from: z.enum(['a', 'b']) }),
        params: z.object({ id: z.uuid() }),
        response: z.object({ from: z.string(), id: z.string() }),
      },
      async ({ query, params }) => ({ ...query, ...params }),
    )
    const id = ACTOR.userId
    const ok = await handler(new NextRequest('http://t/x?from=a'), {
      params: Promise.resolve({ id }),
    })
    expect(await ok.json()).toEqual({ from: 'a', id })
    const bad = await handler(new NextRequest('http://t/x?from=c'), {
      params: Promise.resolve({ id: '1' }),
    })
    const { error } = await bad.json()
    expect(error.details.issues.map((i: { path: string }) => i.path)).toEqual(['query.from'])
  })

  it('maps ApiError to its status and envelope, with details', async () => {
    const handler = route({ auth: 'required', status: 204 }, async () => {
      throw new ApiError('quota_exceeded', 'Limit.', { metric: 'lectures' })
    })
    const res = await handler(post(''), noParams)
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatchObject({
      code: 'quota_exceeded',
      message: 'Limit.',
      details: { metric: 'lectures' },
    })
  })

  it('hides unknown errors behind 500 internal_error', async () => {
    const handler = route({ auth: 'public', status: 204 }, async () => {
      throw new Error('db password is hunter2')
    })
    const res = await handler(post(''), noParams)
    expect(res.status).toBe(500)
    const text = await res.text()
    expect(text).toContain('internal_error')
    expect(text).not.toContain('hunter2')
  })

  it('treats an invalid response as a server error', async () => {
    const handler = route({ auth: 'public', response: z.object({ n: z.number() }) }, async () => ({
      n: 'not a number' as unknown as number,
    }))
    expect((await handler(post(''), noParams)).status).toBe(500)
  })

  it('returns 401 when auth is required and missing', async () => {
    requireActor.mockRejectedValue(new ApiError('unauthenticated'))
    const handler = route({ auth: 'required', status: 204 }, async () => {})
    expect((await handler(post(''), noParams)).status).toBe(401)
  })

  it('supports 201/204 and raw Responses (SSE)', async () => {
    const created = route(
      { auth: 'public', status: 201, response: z.object({ id: z.string() }) },
      async () => ({
        id: 'x',
      }),
    )
    expect((await created(post(''), noParams)).status).toBe(201)
    const empty = route({ auth: 'public', status: 204 }, async () => {})
    expect((await empty(post(''), noParams)).status).toBe(204)
    const stream = route(
      { auth: 'public' },
      async () =>
        new Response('data: hi\n\n', { headers: { 'content-type': 'text/event-stream' } }),
    )
    const res = await stream(post(''), noParams)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(await res.text()).toBe('data: hi\n\n')
  })

  it('logs one JSON line per request', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const handler = route({ auth: 'required', status: 204 }, async () => {})
    await handler(post('', 'http://t/api/v1/me'), noParams)
    expect(log).toHaveBeenCalledTimes(1)
    const line = JSON.parse(String(log.mock.calls[0]?.[0]))
    expect(line).toMatchObject({ userId: ACTOR.userId, route: 'POST /api/v1/me', status: 204 })
    expect(typeof line.latencyMs).toBe('number')
  })

  it('never logs SQL params from a failed query (student text, transcripts, answer keys)', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    // Shape of drizzle-orm's DrizzleQueryError: the message embeds the query and its params.
    const cause = new Error('duplicate key value violates unique constraint "attempts_pkey"')
    const failed = Object.assign(
      new Error('Failed query: insert into "attempts" ... params: SECRET-STUDENT-ANSWER'),
      { name: 'DrizzleQueryError', cause },
    )
    const handler = route({ auth: 'required', status: 204 }, async () => {
      throw failed
    })
    const res = await handler(post(''), noParams)
    expect(res.status).toBe(500)
    const line = String(log.mock.calls[0]?.[0])
    expect(line).not.toContain('SECRET-STUDENT-ANSWER')
    expect(JSON.parse(line).error).toContain('duplicate key value')
  })
})
