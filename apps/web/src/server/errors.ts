import { ERROR_STATUS, type ErrorCode } from '@lectheo/contracts'

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  validation_failed: 'The request is invalid.',
  unauthenticated: 'Please sign in.',
  sample_account_restricted: "Sample accounts can't do that.",
  not_found: 'Not found.',
  invalid_state: "That isn't possible right now.",
  already_processing: 'This is already being processed.',
  payload_too_large: 'That file is too large.',
  unprocessable_input: "We couldn't read that input.",
  quota_exceeded: "You've reached today's limit.",
  rate_limited: 'Too many requests. Please try again shortly.',
  ai_paused: 'AI features are paused for now.',
  intake_paused: 'New processing is paused for now.',
  upstream_unavailable: 'A service we depend on is unavailable. Please try again.',
  internal_error: 'Something went wrong.',
}

/** Error with an API code; the route wrapper maps it to the error envelope (API Spec §1). */
export class ApiError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(message ?? DEFAULT_MESSAGES[code])
    this.name = 'ApiError'
    this.code = code
    this.status = ERROR_STATUS[code]
    this.details = details
  }
}

export const notFound = (): ApiError => new ApiError('not_found')
export const invalidState = (message?: string, details?: Record<string, unknown>): ApiError =>
  new ApiError('invalid_state', message, details)

const MAX_ERROR_LOG_CHARS = 500

/**
 * drizzle's DrizzleQueryError embeds the SQL and its params (student answers, transcripts, answer
 * keys) in its message. Its `name` stays "Error", so match drizzle's fixed message prefix.
 */
const isQueryError = (err: unknown): boolean =>
  err instanceof Error && err.message.startsWith('Failed query:')

/**
 * A loggable description of an unexpected error that never carries SQL params: a failed query is
 * described by the driver error it wraps. Driver messages can still quote one value (e.g. postgres
 * `invalid input syntax for type uuid: "…"`); the length cap bounds it.
 */
export function safeErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err).slice(0, MAX_ERROR_LOG_CHARS)
  const message = !isQueryError(err)
    ? err.message
    : err.cause instanceof Error
      ? err.cause.message
      : 'query failed'
  return `${err.name}: ${message}`.slice(0, MAX_ERROR_LOG_CHARS)
}

/** `err`, or a param-free copy of a failed query (for errors re-thrown to a runtime that logs). */
export const withoutQueryParams = (err: unknown): unknown =>
  isQueryError(err) ? new Error(safeErrorMessage(err)) : err
