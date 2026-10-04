import { z } from 'zod'

export const PingInput = z.object({ word: z.string() })
export type PingInput = z.infer<typeof PingInput>

export const PingOutput = z.object({
  echo: z.string(),
  length: z.number().int(),
})
export type PingOutput = z.infer<typeof PingOutput>
