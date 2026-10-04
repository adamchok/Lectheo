import { ErrorEnvelope, type ErrorCode } from '@lectheo/contracts'
import type { z } from 'zod'

/** All REST routes live under this prefix (API Spec §1). */
export const API_BASE = '/api/v1'

/** Client-only codes for failures that never reached (or never came back from) the API. */
export type ClientErrorCode = ErrorCode | 'network_error' | 'invalid_response'

export class ApiClientError extends Error {
  readonly code: ClientErrorCode
  readonly status: number
  readonly details: Record<string, unknown> | undefined
  readonly requestId: string | undefined

  constructor(init: {
    code: ClientErrorCode
    status: number
    message: string
    details?: Record<string, unknown>
    requestId?: string
    cause?: unknown
  }) {
    super(init.message, { cause: init.cause })
    this.name = 'ApiClientError'
    this.code = init.code
    this.status = init.status
    this.details = init.details
    this.requestId = init.requestId
  }
}

export function isApiClientError(error: unknown): error is ApiClientError {
  return error instanceof ApiClientError
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export interface ApiFetchOptions<S extends z.ZodType | undefined> {
  method?: HttpMethod
  /** Serialized as JSON. */
  body?: unknown
  /** Contracts schema used to parse a 2xx JSON body. Omit for 204 / ignored bodies. */
  schema?: S
  signal?: AbortSignal
}

type Result<S> = S extends z.ZodType ? z.infer<S> : undefined

/**
 * Typed fetch for `/api/v1`. `path` is relative to the API base (e.g. `/courses`).
 * - 2xx: parses the body with `schema` (returns `undefined` when no schema or 204).
 * - non-2xx: parses the error envelope and throws `ApiClientError`.
 */
export async function apiFetch<S extends z.ZodType | undefined = undefined>(
  path: string,
  options: ApiFetchOptions<S> = {},
): Promise<Result<S>> {
  const { method = options.body === undefined ? 'GET' : 'POST', body, schema, signal } = options
  const url = path.startsWith('/api/') ? path : `${API_BASE}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      method,
      signal,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new ApiClientError({
      code: 'network_error',
      status: 0,
      message: "Couldn't reach Lectheo. Check your connection and try again.",
      cause,
    })
  }

  if (!response.ok) throw await toApiError(response)

  if (!schema || response.status === 204) return undefined as Result<S>

  const json: unknown = await response.json().catch(() => undefined)
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ApiClientError({
      code: 'invalid_response',
      status: response.status,
      message: 'The server sent an unexpected response.',
      details: { issues: parsed.error.issues },
      requestId: response.headers.get('x-request-id') ?? undefined,
    })
  }
  return parsed.data as Result<S>
}

async function toApiError(response: Response): Promise<ApiClientError> {
  const json: unknown = await response.json().catch(() => undefined)
  const envelope = ErrorEnvelope.safeParse(json)
  if (envelope.success) {
    const { code, message, details, requestId } = envelope.data.error
    return new ApiClientError({ code, status: response.status, message, details, requestId })
  }
  return new ApiClientError({
    code: response.status === 404 ? 'not_found' : 'internal_error',
    status: response.status,
    message:
      response.status === 404
        ? "We couldn't find that."
        : 'Something went wrong on our side. Please try again.',
    requestId: response.headers.get('x-request-id') ?? undefined,
  })
}
