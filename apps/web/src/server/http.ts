import { NextResponse, type NextRequest } from 'next/server'
import { v7 as uuidv7 } from 'uuid'
import { z } from 'zod'
import { requireActor, type Actor } from './auth'
import { ApiError, safeErrorMessage } from './errors'

export { ApiError, invalidState, notFound } from './errors'

/*
 * Route wrapper (API Spec §1): requestId → auth → zod-parsed input → handler → response schema
 * (allow-list: `parse` strips unknown keys) → error envelope → one JSON log line.
 */

type AuthMode = 'required' | 'public'
type AnySchema = z.ZodType | undefined
type Parsed<S extends AnySchema> = S extends z.ZodType ? z.output<S> : undefined
/** Handlers return the response body (validated + stripped), or a raw Response (SSE, redirects). */
type HandlerResult<R extends AnySchema> = (R extends z.ZodType ? z.input<R> : void) | Response

export interface RouteSpec<A extends AuthMode, B, Q, P, R> {
  auth: A
  body?: B
  query?: Q
  params?: P
  /** Required unless status is 204 or the handler always returns a Response. */
  response?: R
  status?: 200 | 201 | 202 | 204
}

export interface HandlerContext<
  A extends AuthMode,
  B extends AnySchema,
  Q extends AnySchema,
  P extends AnySchema,
> {
  req: NextRequest
  requestId: string
  /** Public routes get null; call getActor() yourself if an optional user matters. */
  actor: A extends 'required' ? Actor : null
  body: Parsed<B>
  query: Parsed<Q>
  params: Parsed<P>
}

/** Next.js route context. Routes without dynamic segments receive `{}` params. */
export interface RouteContext {
  params: Promise<Record<string, string | string[] | undefined>>
}

export function route<
  A extends AuthMode,
  B extends AnySchema = undefined,
  Q extends AnySchema = undefined,
  P extends AnySchema = undefined,
  R extends AnySchema = undefined,
>(
  spec: RouteSpec<A, B, Q, P, R>,
  handler: (ctx: HandlerContext<A, B, Q, P>) => Promise<HandlerResult<R>>,
): (req: NextRequest, ctx: RouteContext) => Promise<Response> {
  return async (req, ctx) => {
    const started = performance.now()
    const requestId = `req_${uuidv7()}`
    const url = new URL(req.url)
    let userId: string | null = null
    let response: Response
    let failure: unknown
    try {
      const actor = spec.auth === 'required' ? await requireActor() : null
      userId = actor?.userId ?? null
      const body = await parseBody(req, spec.body)
      const query = parseInput(spec.query, Object.fromEntries(url.searchParams), 'query')
      const params = parseInput(spec.params, await ctx.params, 'params')
      const result = await handler({
        req,
        requestId,
        actor: actor as HandlerContext<A, B, Q, P>['actor'],
        body: body as Parsed<B>,
        query: query as Parsed<Q>,
        params: params as Parsed<P>,
      })
      response = toResponse(result, spec, requestId)
    } catch (err) {
      failure = err
      response = errorResponse(err, requestId)
    }
    logRequest({
      requestId,
      userId,
      route: `${req.method} ${url.pathname}`,
      status: response.status,
      latencyMs: Math.round(performance.now() - started),
      ...(failure instanceof ApiError ? { code: failure.code } : {}),
      ...(failure && !(failure instanceof ApiError) ? { error: safeErrorMessage(failure) } : {}),
    })
    return response
  }
}

async function parseBody(req: NextRequest, schema: AnySchema): Promise<unknown> {
  if (!schema) return undefined
  const text = await req.text()
  let json: unknown = {}
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      throw new ApiError('validation_failed', 'The request body must be JSON.')
    }
  }
  return parseInput(schema, json, 'body')
}

function parseInput(schema: AnySchema, input: unknown, where: string): unknown {
  if (!schema) return undefined
  const parsed = schema.safeParse(input)
  if (parsed.success) return parsed.data
  const issues = parsed.error.issues.map((i) => ({
    path: [where, ...i.path.map(String)].join('.'),
    code: i.code,
    message: i.message,
  }))
  throw new ApiError('validation_failed', undefined, { issues })
}

function toResponse(
  result: unknown,
  spec: { response?: AnySchema; status?: number },
  requestId: string,
): Response {
  if (result instanceof Response) return result
  const headers = { 'x-request-id': requestId }
  if (spec.status === 204) return new Response(null, { status: 204, headers })
  if (!spec.response) throw new Error('Route returned data but declares no response schema')
  // Allow-list: parse (not passthrough), so keys missing from the schema never leave the server.
  const data = spec.response.parse(result)
  return NextResponse.json(data, { status: spec.status ?? 200, headers })
}

export function errorResponse(err: unknown, requestId: string): Response {
  const apiError = err instanceof ApiError ? err : new ApiError('internal_error')
  const body = {
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}),
      requestId,
    },
  }
  return NextResponse.json(body, {
    status: apiError.status,
    headers: { 'x-request-id': requestId },
  })
}

function logRequest(line: Record<string, unknown>): void {
  // The one structured log line per request (Architecture §10). Vercel indexes JSON logs.
  console.log(JSON.stringify(line))
}
