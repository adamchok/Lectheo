import {
  HintsSecret,
  McqAnswerKey,
  McqPublicPayload,
  RubricSecret,
  SpotFlawAnswerKey,
  SpotFlawPublicPayload,
} from '@lectheo/contracts'
import { citationErrors, schemaErrors, segmentSet } from '../common'
import { mcqRecord, spotFlawRecord } from './map'
import type { DraftItemsInput, DraftItemsOutput, McqDraft, SpotFlawDraft } from './schema'

const RUBRIC_MAX = 2

function mcqErrors(d: McqDraft, where: string): string[] {
  const rec = mcqRecord(d)
  const ids = d.options.map((o) => o.id)
  const texts = d.options.map((o) => o.text.trim().toLowerCase())
  const wrongIds = ids.filter((id) => id !== d.correctOptionId).sort()
  const distractorIds = d.distractors.map((x) => x.optionId).sort()
  return [
    ...schemaErrors(McqPublicPayload, rec.publicPayload, where),
    ...schemaErrors(McqAnswerKey, rec.answerKey, where),
    ...(new Set(ids).size === ids.length ? [] : [`${where}: option ids must be unique`]),
    ...(new Set(texts).size === texts.length ? [] : [`${where}: options must be distinct`]),
    ...(ids.includes(d.correctOptionId) ? [] : [`${where}: correctOptionId not in options`]),
    ...(wrongIds.join() === distractorIds.join()
      ? []
      : [`${where}: need exactly one distractor entry per wrong option`]),
  ]
}

function spotFlawErrors(d: SpotFlawDraft, where: string): string[] {
  const rec = spotFlawRecord(d)
  const idx = d.flawSentenceIdx
  const flawFieldsSet = idx !== null && d.flawSummary !== null && d.correction !== null
  const flawFieldsNull = idx === null && d.flawSummary === null && d.correction === null
  const consistency = d.hasFlaw
    ? [
        ...(flawFieldsSet
          ? []
          : [`${where}: hasFlaw needs flawSentenceIdx, flawSummary, correction`]),
        ...(idx !== null && (idx < 0 || idx >= d.sentences.length)
          ? [`${where}: flawSentenceIdx out of range`]
          : []),
        ...(d.leakKeywords.length > 0 ? [] : [`${where}: leakKeywords required when hasFlaw`]),
      ]
    : flawFieldsNull
      ? []
      : [`${where}: correct scenario must have null flaw fields`]
  return [
    ...schemaErrors(SpotFlawPublicPayload, rec.publicPayload, where),
    ...schemaErrors(SpotFlawAnswerKey, rec.answerKey, where),
    ...consistency,
  ]
}

function commonErrors(
  d: { conceptKey: string; hints: string[]; segmentIdxs: number[]; rubric?: unknown },
  where: string,
  ctx: { keys: ReadonlySet<string>; segments: ReadonlySet<number> },
): string[] {
  return [
    ...(ctx.keys.has(d.conceptKey) ? [] : [`${where}: unknown conceptKey "${d.conceptKey}"`]),
    ...schemaErrors(HintsSecret, d.hints, `${where}.hints`),
    ...citationErrors(d.segmentIdxs, ctx.segments, where),
    ...(d.rubric === undefined ? [] : schemaErrors(RubricSecret, d.rubric, `${where}.rubric`)),
  ]
}

function countErrors(out: DraftItemsOutput, input: DraftItemsInput): string[] {
  const count = (list: readonly { conceptKey: string }[], key: string) =>
    list.filter((d) => d.conceptKey === key).length
  return input.requests.flatMap((r) => {
    const got = {
      mcq: count(out.mcq, r.conceptKey),
      spotFlaw: count(out.spotFlaw, r.conceptKey),
      transfer: count(out.transfer, r.conceptKey),
    }
    return (['mcq', 'spotFlaw', 'transfer'] as const)
      .filter((k) => got[k] !== r[k])
      .map((k) => `${r.conceptKey}: expected ${r[k]} ${k}, got ${got[k]}`)
  })
}

export function validateDrafts(out: DraftItemsOutput, input: DraftItemsInput): string[] {
  const ctx = {
    keys: new Set(input.concepts.map((c) => c.canonicalKey)),
    segments: segmentSet(input.segments),
  }
  const rubricMax = (rubric: { criteria: { id: string; max: number }[] }, where: string) =>
    rubric.criteria
      .filter((c) => c.max !== RUBRIC_MAX)
      .map((c) => `${where}.${c.id}: max must be 2`)
  return [
    ...countErrors(out, input),
    ...out.mcq.flatMap((d, i) => [
      ...mcqErrors(d, `mcq[${i}]`),
      ...commonErrors(d, `mcq[${i}]`, ctx),
    ]),
    ...out.spotFlaw.flatMap((d, i) => [
      ...spotFlawErrors(d, `spotFlaw[${i}]`),
      ...commonErrors(d, `spotFlaw[${i}]`, ctx),
      ...rubricMax(d.rubric, `spotFlaw[${i}]`),
    ]),
    ...out.transfer.flatMap((d, i) => [
      ...commonErrors(d, `transfer[${i}]`, ctx),
      ...rubricMax(d.rubric, `transfer[${i}]`),
    ]),
  ]
}
