import { z } from 'zod'

export const SampleSessionRequest = z.object({ turnstileToken: z.string().min(1) })
export const RedirectResponse = z.object({ redirect: z.string() })

/** GET /me — not in the API spec table; the account menu needs it (F0.5). */
export const MeResponse = z.object({
  id: z.uuid(),
  kind: z.enum(['google', 'sample', 'owner']),
  displayName: z.string().nullable(),
  /** Shows "Sample account · progress resets when you leave" + Reset sample. */
  isSample: z.boolean(),
})
export type MeResponse = z.infer<typeof MeResponse>
