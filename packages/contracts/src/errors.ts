import { z } from 'zod'

/** API error codes → HTTP status (API Spec §1). */
export const ERROR_STATUS = {
  validation_failed: 400,
  unauthenticated: 401,
  sample_account_restricted: 403,
  not_found: 404,
  invalid_state: 409,
  already_processing: 409,
  payload_too_large: 413,
  unprocessable_input: 422,
  quota_exceeded: 429,
  rate_limited: 429,
  ai_paused: 503,
  intake_paused: 503,
  upstream_unavailable: 503,
  internal_error: 500,
} as const

export type ErrorCode = keyof typeof ERROR_STATUS
export const ErrorCodeSchema = z.enum(Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]])

export const ErrorEnvelope = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string(),
  }),
})
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>
