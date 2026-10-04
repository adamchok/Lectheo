import {
  FatalTaskError,
  runTask,
  toItemRecords,
  toVerification,
  verifyItemsTask,
  type ItemRecord,
  type TaskContext,
  type VerifyItem,
  type VerifyItemsOutput,
} from '@lectheo/ai'
import type {
  ItemVerification,
  McqAnswerKey,
  SpotFlawAnswerKey,
  SpotFlawPublicPayload,
  TransferAnswerKey,
} from '@lectheo/contracts'
import { cached, chunk, mapLimit } from './cache'
import { DRAFT_DIRECTIVES } from './curriculum'
import {
  draftBatch,
  isMisconceptionFlaw,
  MISCONCEPTION_MCQ,
  SLOT_KIND,
  type SeedConcept,
  type SeedRequest,
  type Slot,
} from './drafts'

/*
 * One lecture's item bank (F7.3, Architecture §5.3): draft → blind verify (GPT-6.1 Sol, never sees
 * the key) → at most one redraft round for what failed → verify again → keep the first verified
 * items per slot. Rejected items are dropped. Every call's output is cached by round and batch.
 */

const DRAFT_BATCH_CONCEPTS = 2
const VERIFY_BATCH_ITEMS = 4
const MAX_PARALLEL_CALLS = 3
const MAX_FEEDBACK_REASONS = 2

type AnswerKey = McqAnswerKey | SpotFlawAnswerKey | TransferAnswerKey
type Segments = readonly { idx: number; text: string }[]

export interface Candidate {
  ref: string
  round: number
  slot: Slot
  record: ItemRecord
  model: string
  promptVersion: string
  verification: ItemVerification
}

export interface BankResult {
  candidates: Candidate[]
  selected: Candidate[]
  shortfall: { conceptKey: string; slot: Slot; missing: number }[]
}

/** Per concept: 2 MCQs, 2 flaw scenarios, 1 transfer; every other concept has a correct scenario. */
export function targetCounts(conceptIndex: number): Record<Slot, number> {
  const withCorrect = conceptIndex % 2 === 0
  return { mcq: 2, flawed: withCorrect ? 1 : 2, correct: withCorrect ? 1 : 0, transfer: 1 }
}

export const slotOf = (r: ItemRecord): Slot =>
  r.kind === 'diagnostic_mcq'
    ? 'mcq'
    : r.kind === 'transfer'
      ? 'transfer'
      : (r.answerKey as SpotFlawAnswerKey).hasFlaw
        ? 'flawed'
        : 'correct'

/** Satisfies a concept's F7.3 directive (served first when selecting). */
function isDirectiveItem(r: ItemRecord): boolean {
  if (!DRAFT_DIRECTIVES[r.conceptKey]) return false
  if (r.kind === 'diagnostic_mcq') {
    return Object.values(r.distractorMeta ?? {}).some((d) =>
      MISCONCEPTION_MCQ.test(d.misconception),
    )
  }
  if (r.kind !== 'spot_flaw') return false
  const key = r.answerKey as SpotFlawAnswerKey
  return isMisconceptionFlaw({
    hasFlaw: key.hasFlaw,
    flawSentenceIdx: key.flawSentenceIdx,
    sentences: (r.publicPayload as SpotFlawPublicPayload).sentences,
  })
}

type Verdicts = { model: string; results: VerifyItemsOutput['results'] | null }

export async function verifyCandidates(
  name: string,
  segments: Segments,
  drafts: readonly Omit<Candidate, 'verification'>[],
  ctx: TaskContext,
): Promise<Candidate[]> {
  const batches = chunk(drafts, VERIFY_BATCH_ITEMS)
  const verdicts = await mapLimit(batches, MAX_PARALLEL_CALLS, (batch, i) =>
    cached<Verdicts>(`items/${name}-verify-${i}.json`, async () => {
      const items = batch.map((d) => blind(d))
      try {
        const { output, model } = await runTask(verifyItemsTask, { segments, items }, ctx)
        return { model, results: output.results }
      } catch (err) {
        // Unverifiable → rejected, like the pipeline (never served unverified).
        if (err instanceof FatalTaskError) return { model: verifyItemsTask.name, results: null }
        throw err
      }
    }),
  )
  return batches.flatMap((batch, i) => {
    const { model, results } = verdicts[i] as Verdicts
    return batch.map((d) => {
      const solution = results?.find((r) => r.ref === d.ref)
      const verification: ItemVerification = solution
        ? toVerification(blind(d), d.record.answerKey as AnswerKey, solution, model)
        : { verdict: 'fail', solvedAnswer: null, reasons: ['no verdict'], model }
      return { ...d, verification }
    })
  })
}

const blind = (d: Pick<Candidate, 'ref' | 'record'>): VerifyItem => ({
  ref: d.ref,
  kind: d.record.kind,
  publicPayload: d.record.publicPayload,
  segmentIdxs: d.record.segmentIdxs,
})

async function draftRound(
  lecture: string,
  round: number,
  segments: Segments,
  concepts: readonly SeedConcept[],
  requests: readonly SeedRequest[],
  feedback: string | null,
  ctx: TaskContext,
): Promise<Candidate[]> {
  const name = `${lecture}-r${round}`
  const batches = chunk(requests, DRAFT_BATCH_CONCEPTS)
  const drafts = await mapLimit(batches, MAX_PARALLEL_CALLS, (batch, i) =>
    cached(`items/${name}-draft-${i}.json`, () => {
      const keys = new Set(batch.map((r) => r.conceptKey))
      const mine = concepts.filter((c) => keys.has(c.canonicalKey))
      return draftBatch(segments, mine, batch, feedback, ctx)
    }),
  )
  const unverified = drafts.flatMap((draft, i) =>
    toItemRecords(draft.output).map((record, j) => ({
      ref: `${name}-${i}-${j}`,
      round,
      slot: slotOf(record),
      record,
      model: draft.model,
      promptVersion: draft.promptVersion,
    })),
  )
  return verifyCandidates(name, segments, unverified, ctx)
}

function select(
  candidates: readonly Candidate[],
  targets: ReadonlyMap<string, Record<Slot, number>>,
): Pick<BankResult, 'selected' | 'shortfall'> {
  const passed = candidates
    .filter((c) => c.verification.verdict === 'pass')
    .map((c, order) => ({ c, order, first: isDirectiveItem(c.record) ? 0 : 1 }))
    .sort((a, b) => a.first - b.first || a.order - b.order)
    .map(({ c }) => c)
  const selected: Candidate[] = []
  const shortfall: BankResult['shortfall'] = []
  for (const [conceptKey, counts] of targets) {
    for (const slot of Object.keys(counts) as Slot[]) {
      const pick = passed.filter((c) => c.record.conceptKey === conceptKey && c.slot === slot)
      selected.push(...pick.slice(0, counts[slot]))
      const missing = counts[slot] - Math.min(pick.length, counts[slot])
      if (missing > 0) shortfall.push({ conceptKey, slot, missing })
    }
  }
  return { selected, shortfall }
}

function feedbackFor(rejected: readonly Candidate[]): string | null {
  if (rejected.length === 0) return null
  const lines = rejected
    .map((c) => {
      const reasons = c.verification.reasons.slice(0, MAX_FEEDBACK_REASONS).join('; ')
      return `- ${c.record.conceptKey} ${SLOT_KIND[c.slot]} (${c.slot}): ${reasons}`
    })
    .join('\n')
  return `Earlier drafts were rejected by an independent checker:\n${lines}`
}

export async function buildBank(
  lecture: string,
  segments: Segments,
  concepts: readonly SeedConcept[],
  ctx: TaskContext,
): Promise<BankResult> {
  const targets = new Map(concepts.map((c, i) => [c.canonicalKey, targetCounts(i)]))
  const requests = [...targets].map(([conceptKey, counts]) => ({ conceptKey, counts }))
  const first = await draftRound(lecture, 0, segments, concepts, requests, null, ctx)
  const afterFirst = select(first, targets)
  if (afterFirst.shortfall.length === 0) return { candidates: first, ...afterFirst }

  // One redraft round (Architecture §5.3) for exactly the slots still missing.
  const redraft = new Map<string, Record<Slot, number>>()
  for (const { conceptKey, slot, missing } of afterFirst.shortfall) {
    const counts = redraft.get(conceptKey) ?? { mcq: 0, flawed: 0, correct: 0, transfer: 0 }
    redraft.set(conceptKey, { ...counts, [slot]: missing })
  }
  const rejected = first.filter(
    (c) => c.verification.verdict === 'fail' && redraft.has(c.record.conceptKey),
  )
  const second = await draftRound(
    lecture,
    1,
    segments,
    concepts,
    [...redraft].map(([conceptKey, counts]) => ({ conceptKey, counts })),
    feedbackFor(rejected),
    ctx,
  )
  const candidates = [...first, ...second]
  return { candidates, ...select(candidates, targets) }
}
