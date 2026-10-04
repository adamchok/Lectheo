import type {
  DistractorMeta,
  HintsSecret,
  ItemKind,
  McqAnswerKey,
  McqPublicPayload,
  RubricSecret,
  SpotFlawAnswerKey,
  SpotFlawPublicPayload,
  TransferAnswerKey,
  TransferPublicPayload,
} from '@lectheo/contracts'
import type { DraftItemsOutput, McqDraft, SpotFlawDraft, TransferDraft } from './schema'

/** One `items` row + its `item_secrets` row, in @lectheo/contracts shapes. */
export interface ItemRecord {
  readonly conceptKey: string
  readonly kind: ItemKind
  readonly publicPayload: McqPublicPayload | SpotFlawPublicPayload | TransferPublicPayload
  readonly answerKey: McqAnswerKey | SpotFlawAnswerKey | TransferAnswerKey
  readonly distractorMeta: DistractorMeta | null
  readonly rubric: RubricSecret | null
  readonly hints: HintsSecret
  readonly leakKeywords: readonly string[]
  readonly segmentIdxs: readonly number[]
}

const hintPair = (hints: readonly string[]): HintsSecret => [hints[0] ?? '', hints[1] ?? '']

export function mcqRecord(d: McqDraft): ItemRecord {
  return {
    conceptKey: d.conceptKey,
    kind: 'diagnostic_mcq',
    publicPayload: { stem: d.stem, options: d.options },
    answerKey: { correctOptionId: d.correctOptionId, explanation: d.explanation },
    distractorMeta: Object.fromEntries(
      d.distractors.map((x) => [
        x.optionId,
        { misconception: x.misconception, whyWrong: x.whyWrong },
      ]),
    ),
    rubric: null,
    hints: hintPair(d.hints),
    leakKeywords: [],
    segmentIdxs: d.segmentIdxs,
  }
}

export function spotFlawRecord(d: SpotFlawDraft): ItemRecord {
  return {
    conceptKey: d.conceptKey,
    kind: 'spot_flaw',
    publicPayload: { sentences: d.sentences },
    answerKey: {
      hasFlaw: d.hasFlaw,
      flawSentenceIdx: d.flawSentenceIdx,
      flawSummary: d.flawSummary,
      correction: d.correction,
      explanation: d.explanation,
    },
    distractorMeta: null,
    rubric: d.rubric,
    hints: hintPair(d.hints),
    leakKeywords: d.leakKeywords,
    segmentIdxs: d.segmentIdxs,
  }
}

export function transferRecord(d: TransferDraft): ItemRecord {
  return {
    conceptKey: d.conceptKey,
    kind: 'transfer',
    publicPayload: { prompt: d.prompt },
    answerKey: { modelSolution: d.modelSolution, explanation: d.explanation },
    distractorMeta: null,
    rubric: d.rubric,
    hints: hintPair(d.hints),
    leakKeywords: [],
    segmentIdxs: d.segmentIdxs,
  }
}

/** Maps a validated draft batch straight to DB-ready records. */
export function toItemRecords(out: DraftItemsOutput): ItemRecord[] {
  return [
    ...out.mcq.map(mcqRecord),
    ...out.spotFlaw.map(spotFlawRecord),
    ...out.transfer.map(transferRecord),
  ]
}
