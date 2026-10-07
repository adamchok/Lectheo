import { DEFAULT_RETRY_DELAY_MS } from './call-model'
import { errorMessage, FatalTaskError } from './errors'
import type { Logger } from './log'
import { GOOGLE_DIRECT } from './models'
import type { TaskDef, TaskResult } from './run-task'
import type { TaskContext } from './types'
import { addUsage, type UsageTotals } from './usage'

/*
 * The direct Google API client (ADR-017): the only path for direct roles (the `transcriber`).
 * The AI Gateway drops part-level `videoMetadata`, so a YouTube clip through it bills the whole
 * video (spike F10.1). Same contract as the gateway path: schema check, one re-ask, one
 * llm_calls entry per runTask call, priced from `usageMetadata` at list price.
 */

export const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** One user turn of `generateContent`: parts (e.g. fileData + videoMetadata, text) + config. */
export interface GoogleRequest {
  readonly parts: readonly Record<string, unknown>[]
  readonly generationConfig: Record<string, unknown>
}

export class GoogleHttpError extends Error {
  override readonly name = 'GoogleHttpError'
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(`Google API ${statusCode}: ${message}`)
  }
}

/** Rate limits and server-side failures pass; any other 4xx is the request's (or video's) fault. */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS = 4
/** A 2-minute clip answers in 10–40 s (spike); this bounds a hung request. */
const REQUEST_TIMEOUT_MS = 90_000

interface GoogleResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: {
    promptTokenCount?: number
    cachedContentTokenCount?: number
    candidatesTokenCount?: number
    thoughtsTokenCount?: number
  }
  error?: { message?: string }
}

/** Tokens and list-price cost of one response (thinking tokens bill as output). */
export function googleUsage(meta: GoogleResponse['usageMetadata']): UsageTotals {
  const inputTokens = meta?.promptTokenCount ?? 0
  const outputTokens = (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0)
  const costUsd =
    (inputTokens * GOOGLE_DIRECT.inputUsdPerMTok + outputTokens * GOOGLE_DIRECT.outputUsdPerMTok) /
    1e6
  return { inputTokens, cachedTokens: meta?.cachedContentTokenCount ?? 0, outputTokens, costUsd }
}

const isRetryable = (error: unknown): boolean =>
  error instanceof GoogleHttpError
    ? RETRY_STATUSES.has(error.statusCode)
    : error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

async function callOnce(
  request: GoogleRequest,
  ctx: TaskContext,
): Promise<{ text: string; usage: UsageTotals }> {
  const key = process.env['GOOGLE_GENERATIVE_AI_API_KEY']
  if (!key) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set')
  const response = await (ctx.fetch ?? fetch)(
    `${GOOGLE_API_BASE}/${GOOGLE_DIRECT.model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: request.parts }],
        generationConfig: request.generationConfig,
      }),
      // The caller's deadline (the pipeline step's) and this request's own timeout.
      signal: AbortSignal.any([
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(ctx.abortSignal ? [ctx.abortSignal] : []),
      ]),
    },
  )
  const body = (await response.json().catch(() => ({}))) as GoogleResponse
  if (!response.ok) {
    throw new GoogleHttpError(response.status, body.error?.message ?? response.statusText)
  }
  const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  return { text, usage: googleUsage(body.usageMetadata) }
}

/** Retries 429 / 503 / network errors with exponential backoff (rejected calls aren't billed). */
async function callWithRetry(
  request: GoogleRequest,
  ctx: TaskContext,
): Promise<{ text: string; usage: UsageTotals }> {
  const base = ctx.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  for (let attempt = 1; ; attempt++) {
    try {
      return await callOnce(request, ctx)
    } catch (error) {
      const stopped = ctx.abortSignal?.aborted ?? false
      if (stopped || attempt >= MAX_ATTEMPTS || !isRetryable(error)) throw error
      await sleep(base * 2 ** (attempt - 1))
    }
  }
}

function parseOutput<O>(task: TaskDef<unknown, O>, text: string, input: unknown) {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { output: null, errors: [`output is not JSON: ${errorMessage(error)}`] }
  }
  const parsed = task.schema.safeParse(json)
  if (!parsed.success) {
    return { output: null, errors: [`output does not match the schema: ${parsed.error.message}`] }
  }
  return { output: parsed.data, errors: task.validate?.(parsed.data, input) ?? [] }
}

/** Direct-role half of runTask: request → parse/validate → one re-ask → log once. */
export async function runGoogleDirect<I, O>(
  task: TaskDef<I, O>,
  input: I,
  ctx: TaskContext,
  log: Logger,
): Promise<Omit<TaskResult<O>, 'latencyMs'>> {
  const model = GOOGLE_DIRECT.model
  let usage: UsageTotals = { inputTokens: 0, cachedTokens: 0, outputTokens: 0, costUsd: 0 }
  let result: Omit<TaskResult<O>, 'latencyMs'> | null = null
  try {
    if (!task.google) throw new Error(`Task "${task.name}" has no Google request`)
    const request = task.google(input)
    let errors: readonly string[] = []
    for (let round = 0; round < 2 && result === null; round++) {
      const call = await callWithRetry(request, ctx)
      usage = addUsage(usage, call.usage)
      const parsed = parseOutput(task as TaskDef<unknown, O>, call.text, input)
      errors = parsed.errors
      if (parsed.output !== null && errors.length === 0) {
        result = { output: parsed.output, model, outcome: round === 0 ? 'ok' : 'repaired', usage }
      }
    }
    if (result === null) throw new FatalTaskError(task.name, errors)
  } catch (error) {
    await log('failed', usage, model)
    throw error
  }
  await log(result.outcome, result.usage, model)
  return result
}
