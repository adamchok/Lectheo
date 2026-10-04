import { toItemRecords, type TaskContext } from '@lectheo/ai'
import type { ItemKind } from '@lectheo/contracts'
import { slotOf, verifyCandidates, type Candidate } from './bank'
import { cached } from './cache'
import { draftBatch, type SeedConcept, type Slot } from './drafts'
import type { Revision } from './reviewed'

/*
 * Reviewer-requested redrafts of single items (PR #10 review), in place: the replacement keeps the
 * item's concept, kind and variant, so its seed id is unchanged. Same gate as the bank: Opus
 * drafts with the reviewer's note, Sol blind-verifies, at most one redraft with the verifier's
 * reasons. A revision that still fails keeps the original item and is reported.
 */

const MAX_ATTEMPTS = 2

export interface RevisionResult {
  item: string
  verdict: 'pass' | 'fail'
  attempts: number
  reasons: string[]
}

type Segments = readonly { idx: number; text: string }[]

/** concept/kind/variant of each selected candidate (variants count per concept and kind). */
export function itemKeys(selected: readonly Candidate[]): string[] {
  const used = new Map<string, number>()
  return selected.map((c) => {
    const slot = `${c.record.conceptKey}/${c.record.kind}`
    const variant = (used.get(slot) ?? 0) + 1
    used.set(slot, variant)
    return `${slot}/${variant}`
  })
}

const KIND_SLOT: Readonly<Record<ItemKind, Slot>> = {
  diagnostic_mcq: 'mcq',
  spot_flaw: 'flawed',
  transfer: 'transfer',
}

function notesFor(r: Revision, previous: Candidate | undefined, rejection: string[]): string {
  const before = previous ? JSON.stringify(previous.record.publicPayload) : null
  return [
    'Reviewer note for this item (a CS-literate reviewer flagged the previous version):',
    r.note,
    before ? `Previous version (do not repeat its problem): ${before}` : '',
    rejection.length > 0
      ? `Your last redraft was rejected by an independent checker: ${rejection.join('; ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function reviseOne(
  r: Revision,
  previous: Candidate | undefined,
  concept: SeedConcept,
  segments: Segments,
  ctx: TaskContext,
): Promise<{ candidate: Candidate | null; result: RevisionResult }> {
  const kind = r.item.split('/')[1] as ItemKind
  const slot = previous?.slot ?? KIND_SLOT[kind]
  const name = `revise-${r.item.replace(/\//g, '-')}`
  let reasons: string[] = []
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const counts = { mcq: 0, flawed: 0, correct: 0, transfer: 0, [slot]: 1 }
    const draft = await cached(`items/${name}-a${attempt}-draft.json`, () =>
      draftBatch(
        segments,
        [concept],
        [{ conceptKey: concept.canonicalKey, counts }],
        notesFor(r, previous, reasons),
        ctx,
      ),
    )
    const record = toItemRecords(draft.output)[0]
    if (!record) throw new Error(`${r.item}: draft returned no item`)
    const ref = `${name}-a${attempt}`
    const [candidate] = await verifyCandidates(
      ref,
      segments,
      [
        {
          ref,
          round: 2,
          slot: slotOf(record),
          record,
          model: draft.model,
          promptVersion: draft.promptVersion,
        },
      ],
      ctx,
    )
    if (!candidate) throw new Error(`${r.item}: no verdict`)
    if (candidate.verification.verdict === 'pass') {
      return {
        candidate,
        result: { item: r.item, verdict: 'pass', attempts: attempt, reasons: [] },
      }
    }
    reasons = candidate.verification.reasons
  }
  return {
    candidate: null,
    result: { item: r.item, verdict: 'fail', attempts: MAX_ATTEMPTS, reasons },
  }
}

/** Applies this lecture's revisions to the selected items; a fill appends a missing slot. */
export async function reviseBank(
  selected: readonly Candidate[],
  revisions: readonly Revision[],
  concepts: readonly SeedConcept[],
  segments: Segments,
  ctx: TaskContext,
): Promise<{ selected: Candidate[]; results: RevisionResult[] }> {
  const out = [...selected]
  const results: RevisionResult[] = []
  for (const r of revisions) {
    const concept = concepts.find((c) => c.canonicalKey === r.item.split('/')[0])
    if (!concept) continue
    const index = itemKeys(out).indexOf(r.item)
    const { candidate, result } = await reviseOne(r, out[index], concept, segments, ctx)
    results.push(result)
    if (!candidate) continue
    if (index >= 0) out[index] = candidate
    else out.push(candidate)
  }
  return { selected: out, results }
}
