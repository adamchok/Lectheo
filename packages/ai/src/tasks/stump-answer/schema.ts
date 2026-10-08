import { z } from 'zod'
import type { CourseTitles } from '../../prompt'

/**
 * Architecture §4.7 step 2: the answerer (Sonnet) answers the student's question. ADR-009: there
 * is deliberately no answer-key field, so the key can't reach this prompt.
 */
export interface StumpAnswerInput extends CourseTitles {
  readonly conceptName: string
  readonly segments: readonly { readonly idx: number; readonly text: string }[]
  readonly question: string
}

export const StumpAnswerOutput = z.object({ answer: z.string() })
export type StumpAnswerOutput = z.infer<typeof StumpAnswerOutput>
