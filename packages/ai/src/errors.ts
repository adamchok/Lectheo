/**
 * Typed errors thrown by the AI seam. The web app / pipeline maps them:
 * - FatalTaskError → workflow FatalError (no retry), 422/500 in request routes
 * - AiPausedError  → 503 ai_paused (gateway key budget hit, HTTP 402)
 * Errors thrown by the injected hooks (budget / quota) are rethrown unchanged.
 */

export class FatalTaskError extends Error {
  override readonly name = 'FatalTaskError'
  readonly retryable = false
  constructor(
    readonly task: string,
    readonly errors: readonly string[],
    options?: { cause?: unknown },
  ) {
    super(`Task "${task}" produced invalid output after repair: ${errors.join('; ')}`, options)
  }
}

export class AiPausedError extends Error {
  override readonly name = 'AiPausedError'
  readonly code = 'ai_paused'
  constructor(options?: { cause?: unknown }) {
    super('AI gateway budget exhausted (HTTP 402)', options)
  }
}

const HTTP_PAYMENT_REQUIRED = 402
const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR = 500
const TIMEOUT_ERROR_NAMES = new Set(['TimeoutError', 'AbortError'])

interface ErrorLike {
  readonly name?: unknown
  readonly statusCode?: unknown
  readonly isRetryable?: unknown
  readonly lastError?: unknown
  readonly cause?: unknown
}

const MAX_UNWRAP_DEPTH = 5

/** Walks RetryError.lastError / cause chains and returns every error found (outermost first). */
function errorChain(error: unknown): readonly ErrorLike[] {
  const chain: ErrorLike[] = []
  let current: unknown = error
  for (let depth = 0; depth < MAX_UNWRAP_DEPTH && typeof current === 'object' && current; depth++) {
    const e = current as ErrorLike
    chain.push(e)
    current = e.lastError ?? e.cause
  }
  return chain
}

function statusOf(error: unknown): number | null {
  for (const e of errorChain(error)) {
    if (typeof e.statusCode === 'number') return e.statusCode
  }
  return null
}

export function isBudgetExhausted(error: unknown): boolean {
  return statusOf(error) === HTTP_PAYMENT_REQUIRED
}

/** 429 / 5xx / timeouts / provider-flagged retryable errors (Architecture §8). */
export function isTransient(error: unknown): boolean {
  const status = statusOf(error)
  if (status === HTTP_TOO_MANY_REQUESTS || (status !== null && status >= HTTP_SERVER_ERROR)) {
    return true
  }
  return errorChain(error).some(
    (e) =>
      e.isRetryable === true || (typeof e.name === 'string' && TIMEOUT_ERROR_NAMES.has(e.name)),
  )
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
