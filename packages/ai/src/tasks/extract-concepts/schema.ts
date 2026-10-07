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
  /**
   * F11: how many chapters to ask for (domain chapterCountRange, about 8–15 per hour) when the
   * lecture has timestamps. Absent or null: no chapters (untimed transcripts).
   */
  readonly chapterCount?: { readonly min: number; readonly max: number } | null
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

/** F11.2: a chapter names the segment it starts at, never a time; it ends where the next starts. */
export const ExtractedChapter = z.object({
  title: z.string(),
  /** One line: what this part of the lecture does. */
  summary: z.string(),
  /** [s42] → 42 */
  startIdx: z.number().int(),
  /** Concepts this chapter teaches, by canonicalKey; empty for announcements, Q&A, breaks. */
  conceptKeys: z.array(z.string()),
})

export const ExtractConceptsOutput = z.object({
  concepts: z.array(ExtractedConcept),
  edges: z.array(ExtractedEdge),
  /** Empty when no chapters were asked for. Validated in the pipeline's validateGraph. */
  chapters: z.array(ExtractedChapter),
})
export type ExtractConceptsOutput = z.infer<typeof ExtractConceptsOutput>
