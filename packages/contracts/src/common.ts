import { z } from 'zod'
import { MasteryState } from './enums'

export const Id = z.uuid()
/** Client-generated UUIDv7 for creating requests (ON CONFLICT DO NOTHING). */
export const ClientId = z.uuidv7()
export const Ms = z.number().int().nonnegative()

/** Grounding link: "▶ 12:41 · excerpt" (Architecture §7 <SourceRef>). */
export const SourceRef = z.object({
  lectureId: Id,
  idx: z.number().int().nonnegative(),
  startMs: Ms,
  excerpt: z.string(),
})
export type SourceRef = z.infer<typeof SourceRef>

export const MasterySummary = z.object({
  conceptId: Id,
  state: MasteryState,
  confidentMistake: z.boolean().optional(),
  reasons: z.array(z.string()).optional(),
})
export type MasterySummary = z.infer<typeof MasterySummary>

export const Attribution = z.object({ text: z.string(), url: z.url() })
export type Attribution = z.infer<typeof Attribution>
