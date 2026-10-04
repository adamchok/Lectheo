import { RELATIONS } from '@lectheo/contracts'
import { z } from 'zod'
import { LlmSegmentIdxs } from '../common'

export interface ExtractConceptsInput {
  readonly lectureTitle: string
  readonly segments: readonly { readonly idx: number; readonly text: string }[]
  /** Course concepts already in the DB (ADR-006 dedupe): reuse their canonical keys. */
  readonly existingConcepts: readonly { readonly canonicalKey: string; readonly name: string }[]
  /** domain/scale.ts: clamp(round(minutes / 3), 3, 20). */
  readonly targetCount: number
}

export const ExtractedConcept = z.object({
  /** lower-kebab normalised name → concepts.canonical_key */
  canonicalKey: z.string(),
  name: z.string(),
  /** one grounded sentence → concepts.summary */
  summary: z.string(),
  /** 0..1 → concept_occurrences.salience */
  salience: z.number(),
  /** → concept_occurrences.segment_idxs */
  segmentIdxs: LlmSegmentIdxs,
  /** 2–5 → concepts.key_points (contracts KeyPoints) */
  keyPoints: z.array(z.object({ id: z.string(), text: z.string(), segmentIdxs: LlmSegmentIdxs })),
})

export const ExtractedEdge = z.object({
  fromKey: z.string(),
  toKey: z.string(),
  relation: z.enum(RELATIONS),
  segmentIdxs: LlmSegmentIdxs,
})

export const ExtractConceptsOutput = z.object({
  concepts: z.array(ExtractedConcept),
  edges: z.array(ExtractedEdge),
})
export type ExtractConceptsOutput = z.infer<typeof ExtractConceptsOutput>
