import type { ItemKind } from '@lectheo/contracts'
import { z } from 'zod'

/** What the verifier sees: public payload + citations, never the key (blind solve). */
export interface VerifyItem {
  readonly ref: string
  readonly kind: ItemKind
  readonly publicPayload: unknown
  readonly segmentIdxs: readonly number[]
}

export interface VerifyItemsInput {
  readonly segments: readonly { readonly idx: number; readonly text: string }[]
  readonly items: readonly VerifyItem[]
}

export const ItemSolution = z.object({
  ref: z.string(),
  /** MCQ: the chosen option id. Spot-flaw: "flawed" or "correct". Transfer: a short solution. */
  solvedAnswer: z.string(),
  /** Spot-flaw only: index of the flawed sentence, else null. */
  flawSentenceIdx: z.number().int().nullable(),
  /** Exactly one defensible answer (MCQ) / exactly one or no flaw (spot-flaw). */
  singleAnswer: z.boolean(),
  /** The cited segments support the answer. */
  citationsSupport: z.boolean(),
  unambiguous: z.boolean(),
  reasons: z.array(z.string()),
})
export type ItemSolution = z.infer<typeof ItemSolution>

export const VerifyItemsOutput = z.object({ results: z.array(ItemSolution) })
export type VerifyItemsOutput = z.infer<typeof VerifyItemsOutput>
