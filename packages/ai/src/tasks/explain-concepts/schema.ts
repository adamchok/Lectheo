import { z } from 'zod'
import type { PromptSegment } from '../../prompt'
import { LlmSegmentIdxs } from '../common'

export interface ExplainConceptsInput {
  /** The concepts' own segments only (occurrences and key point citations). */
  readonly segments: readonly PromptSegment[]
  /**
   * The lecture's NEW concepts (first_lecture_id = this lecture). Names, summaries and key points
   * only: never answer keys, flaws, rubrics, hints or leak keywords (ADR-009, F9.14).
   */
  readonly concepts: readonly {
    readonly key: string
    readonly name: string
    readonly summary: string
    readonly keyPoints: readonly string[]
    readonly segmentIdxs: readonly number[]
  }[]
}

export const ExplainedConcept = z.object({
  /** The input concept's key. */
  conceptKey: z.string(),
  /** 2–4 short paragraphs, each citing segment indexes ([s42] → 42). */
  howItWorks: z.array(z.object({ text: z.string(), cites: LlmSegmentIdxs })),
  example: z
    .object({ text: z.string(), code: z.string().nullable(), beyondLecture: z.boolean() })
    .nullable(),
  /** 2–3 misconceptions and why they fail. */
  mistakes: z.array(z.object({ mistake: z.string(), why: z.string() })),
})
export type ExplainedConcept = z.infer<typeof ExplainedConcept>

export const ExplainConceptsOutput = z.object({ concepts: z.array(ExplainedConcept) })
export type ExplainConceptsOutput = z.infer<typeof ExplainConceptsOutput>
