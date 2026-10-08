import { z } from 'zod'
import type { CourseTitles } from '../../prompt'
import { LlmSegmentIdxs } from '../common'

export const STUMP_MODES = ['validate', 'compare'] as const

/**
 * Architecture §4.7. Pass 1 `validate`: is the student's question + key valid?
 * Pass 2 `compare`: is the answerer's (Sonnet) answer correct against the key?
 */
export interface StumpRefereeInput extends CourseTitles {
  readonly mode: (typeof STUMP_MODES)[number]
  readonly conceptName: string
  readonly segments: readonly { readonly idx: number; readonly text: string }[]
  readonly question: string
  readonly answerKey: string
  /** Required in `compare` mode, null in `validate` mode. */
  readonly aiAnswer: string | null
}

export const StumpRefereeOutput = z.object({
  valid: z.boolean(),
  onConcept: z.boolean(),
  unambiguous: z.boolean(),
  answerable: z.boolean(),
  keyCorrect: z.boolean(),
  /** compare mode only (null in validate mode). true = the AI answered correctly. */
  aiCorrect: z.boolean().nullable(),
  reason: z.string(),
  segmentIdxs: LlmSegmentIdxs,
  /** true when the referee relied on standard course knowledge, not the lecture. */
  usesCourseKnowledge: z.boolean(),
})
export type StumpRefereeOutput = z.infer<typeof StumpRefereeOutput>
