import { z } from 'zod'

export const LeakEscalationInput = z.object({
  scenarioSentences: z.array(z.string()),
  flawSentenceIdx: z.number().int().nonnegative(),
  flawSummary: z.string(),
  correction: z.string(),
  reply: z.string(),
})
export type LeakEscalationInput = z.infer<typeof LeakEscalationInput>

export const LeakEscalationOutput = z.object({
  /** true = the reply reveals or hints at the flaw location or its correction. */
  leaks: z.boolean(),
  reason: z.string(),
})
export type LeakEscalationOutput = z.infer<typeof LeakEscalationOutput>
