import { z } from 'zod'

export const HealthResponse = z.object({
  ok: z.boolean(),
  db: z.enum(['ok', 'error']),
  aiPaused: z.boolean(),
  intakePaused: z.boolean(),
  version: z.string(),
})
