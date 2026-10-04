/**
 * Item quality sheet (Architecture §10 "Content quality"): a stratified sample of ~20 library
 * bank items with their key, the verifier's blind answer and the reviewer's hand check, written to
 * docs/evals/items.csv. No model calls.
 *
 *   pnpm --filter @lectheo/scripts eval-items
 *
 * The hand check lives in evals/item-review.ts (keyed by concept/kind/variant), so regenerating
 * the bank shows which reviewed items changed (their review goes blank).
 */
import { ITEMS, LECTURES, type ItemFx } from '@lectheo/db/seed'
import { writeEvalCsv } from './lib/csv'
import { ITEM_REVIEW, type ItemReview } from './evals/item-review'

const SAMPLE_SIZE = 20

const itemKey = (i: Pick<ItemFx, 'concept' | 'kind' | 'variant'>): string =>
  `${i.concept}/${i.kind}/${i.variant}`

/** Evenly spaced over the bank (ordered by lecture, concept, kind), so every kind shows up. */
function sampleItems(items: readonly ItemFx[], n = SAMPLE_SIZE): ItemFx[] {
  return Array.from({ length: Math.min(n, items.length) }, (_, i) => {
    const item = items[Math.floor((i * items.length) / n)]
    if (!item) throw new Error('sample out of range')
    return item
  })
}

function questionText(item: ItemFx): string {
  if (item.kind === 'diagnostic_mcq') {
    const options = item.publicPayload.options.map((o) => `${o.id}) ${o.text}`).join(' | ')
    return `${item.publicPayload.stem} || ${options}`
  }
  if (item.kind === 'spot_flaw') {
    return item.publicPayload.sentences.map((s, i) => `[${i}] ${s}`).join(' ')
  }
  return item.publicPayload.prompt
}

function keyText(item: ItemFx): string {
  if (item.kind === 'diagnostic_mcq') return item.answerKey.correctOptionId
  if (item.kind === 'spot_flaw') {
    const k = item.answerKey
    return k.hasFlaw ? `flawed:${k.flawSentenceIdx} — ${k.correction}` : 'correct'
  }
  return item.answerKey.modelSolution
}

const yesNo = (v: boolean | undefined): string => (v === undefined ? '' : v ? 'yes' : 'no')

function main(): void {
  const lectureOf = new Map(LECTURES.flatMap((l) => l.concepts.map((c) => [c.key, l.key])))
  const sample = sampleItems(ITEMS)
  const reviews = sample.map((i): ItemReview | undefined => ITEM_REVIEW[itemKey(i)])
  const rows = sample.map((item, i) => {
    const r = reviews[i]
    return [
      itemKey(item),
      lectureOf.get(item.concept),
      item.kind,
      questionText(item),
      keyText(item),
      item.verification.solvedAnswer,
      item.verification.verdict,
      item.segs.join(' '),
      yesNo(r?.keyCorrect),
      yesNo(r?.singleAnswer),
      yesNo(r?.grounded),
      r?.note ?? '',
    ]
  })
  const path = writeEvalCsv('items', [
    [
      'item',
      'lecture',
      'kind',
      'question',
      'key',
      'verifier_answer',
      'verifier_verdict',
      'cited_segments',
      'review_key_correct',
      'review_single_answer',
      'review_grounded',
      'review_note',
    ],
    ...rows,
  ])
  const reviewed = reviews.filter((r): r is ItemReview => r !== undefined)
  const ok = reviewed.filter((r) => r.keyCorrect && r.singleAnswer && r.grounded).length
  process.stdout.write(
    `${path}: ${sample.length} items, ${reviewed.length} reviewed, ${ok} pass every check\n`,
  )
}

main()
