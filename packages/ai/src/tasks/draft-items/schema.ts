import { z } from 'zod'
import { LlmSegmentIdxs } from '../common'

export interface DraftConcept {
  readonly canonicalKey: string
  readonly name: string
  readonly summary: string
  readonly keyPoints: readonly { readonly id: string; readonly text: string }[]
}

export interface DraftRequest {
  readonly conceptKey: string
  readonly mcq: number
  readonly spotFlaw: number
  readonly transfer: number
}

export interface DraftItemsInput {
  readonly segments: readonly { readonly idx: number; readonly text: string }[]
  /** Batch of ≤ 4 concepts (Architecture §4.3). */
  readonly concepts: readonly DraftConcept[]
  readonly requests: readonly DraftRequest[]
}

const LlmRubric = z.object({
  criteria: z.array(
    z.object({ id: z.string(), label: z.string(), description: z.string(), max: z.number().int() }),
  ),
})

export const McqDraft = z.object({
  conceptKey: z.string(),
  stem: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })),
  correctOptionId: z.string(),
  explanation: z.string(),
  /** One per wrong option (item_secrets.distractor_meta). */
  distractors: z.array(
    z.object({ optionId: z.string(), misconception: z.string(), whyWrong: z.string() }),
  ),
  hints: z.array(z.string()),
  segmentIdxs: LlmSegmentIdxs,
})
export type McqDraft = z.infer<typeof McqDraft>

export const SpotFlawDraft = z.object({
  conceptKey: z.string(),
  sentences: z.array(z.string()),
  hasFlaw: z.boolean(),
  flawSentenceIdx: z.number().int().nullable(),
  flawSummary: z.string().nullable(),
  correction: z.string().nullable(),
  explanation: z.string(),
  /** Criteria for judging the student's correction. */
  rubric: LlmRubric,
  hints: z.array(z.string()),
  /** Words that would give the flaw away if the author said them. */
  leakKeywords: z.array(z.string()),
  segmentIdxs: LlmSegmentIdxs,
})
export type SpotFlawDraft = z.infer<typeof SpotFlawDraft>

export const TransferDraft = z.object({
  conceptKey: z.string(),
  prompt: z.string(),
  modelSolution: z.string(),
  explanation: z.string(),
  rubric: LlmRubric,
  hints: z.array(z.string()),
  segmentIdxs: LlmSegmentIdxs,
})
export type TransferDraft = z.infer<typeof TransferDraft>

/** Separate arrays per kind instead of a union: friendlier to strict JSON schema. */
export const DraftItemsOutput = z.object({
  mcq: z.array(McqDraft),
  spotFlaw: z.array(SpotFlawDraft),
  transfer: z.array(TransferDraft),
})
export type DraftItemsOutput = z.infer<typeof DraftItemsOutput>
