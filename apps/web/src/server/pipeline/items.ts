import {
  draftItemsTask,
  FatalTaskError,
  runTask,
  toItemRecords,
  toVerification,
  verifyItemsTask,
  type ItemRecord,
  type VerifyItem,
} from '@lectheo/ai'
import type {
  ItemKind,
  ItemVerification,
  KeyPoints,
  McqAnswerKey,
  SpotFlawAnswerKey,
  TransferAnswerKey,
} from '@lectheo/contracts'
import {
  and,
  asc,
  conceptOccurrences,
  concepts,
  count,
  desc,
  eq,
  inArray,
  items,
  itemSecrets,
  ne,
  uuidv7,
} from '@lectheo/db'
import { aiContext } from '../ai-hooks'
import type { DbLike } from '../db'
import { loadLecture, loadSegments } from './segments'
import { mergeStepOutput, runStep, stepOutput } from './state'

/*
 * Item steps (Architecture §4.3, §5.3, ADR-010). User lectures get diagnostic MCQs for every
 * concept plus spot-the-flaw practice for the top concepts; everything else is generated on
 * demand. Nothing reaches a student until the verifier (another model family) blind-solves it.
 * Old items are retired by the claim on a re-run, never deleted (attempts reference them).
 */

/** Two variants: the diagnostic's follow-up question needs a second item on the same concept. */
const MCQ_PER_CONCEPT = 2
const PRACTICE_CONCEPTS = 3
const SPOT_FLAW_PER_PRACTICE_CONCEPT = 2
/** Every concept gets one spot-the-flaw scenario (F4c is the main activity, Arch §4.3). */
const SPOT_FLAW_PER_CONCEPT = 1
const DRAFT_BATCH_CONCEPTS = 4
/** The verifier's output budget is 4k tokens; 4 items per call stays well inside it. */
const VERIFY_BATCH_ITEMS = 4

type PromptSegment = { idx: number; text: string }
type AnswerKey = McqAnswerKey | SpotFlawAnswerKey | TransferAnswerKey

interface LectureConcept {
  id: string
  canonicalKey: string
  name: string
  summary: string
  keyPoints: KeyPoints
}

interface DraftRequest {
  concept: LectureConcept
  mcq: number
  spotFlaw: number
}

const chunk = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  )

/** Parallel model calls per step, to stay under the gateway's rate limits. */
const MAX_PARALLEL_CALLS = 4
/** The diagnostic's follow-up rule needs two verified MCQs on a concept. */
const MIN_VERIFIED_MCQS = 2

/** Promise.all with at most `limit` calls in flight; results keep the input order. */
async function mapLimit<T, R>(list: readonly T[], limit: number, fn: (x: T) => Promise<R>) {
  const results: R[] = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      results[i] = await fn(list[i] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return results
}

/** AI context billed to the lecture's owner (llm_calls.user_id), pipeline quota rules. */
async function pipelineAi(db: DbLike, lectureId: string) {
  const { ownerId } = await loadLecture(db, lectureId)
  return aiContext({ userId: ownerId, lectureId, intake: true, skipQuota: true, db })
}

const promptSegments = async (db: DbLike, lectureId: string): Promise<PromptSegment[]> =>
  (await loadSegments(db, lectureId)).map(({ idx, text }) => ({ idx, text }))

/** This lecture's concepts, most salient first (the top ones get practice items). */
function lectureConcepts(db: DbLike, lectureId: string): Promise<LectureConcept[]> {
  return db
    .select({
      id: concepts.id,
      canonicalKey: concepts.canonicalKey,
      name: concepts.name,
      summary: concepts.summary,
      keyPoints: concepts.keyPoints,
    })
    .from(conceptOccurrences)
    .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
    .where(eq(conceptOccurrences.lectureId, lectureId))
    .orderBy(desc(conceptOccurrences.salience), asc(concepts.id))
}

/** Concepts that already have live (non-retired) items from this lecture. */
async function draftedConcepts(db: DbLike, lectureId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ conceptId: items.conceptId })
    .from(items)
    .where(and(eq(items.lectureId, lectureId), ne(items.status, 'retired')))
  return new Set(rows.map((r) => r.conceptId))
}

/** One draft call (≤ 4 concepts) → DB-ready records. */
async function draftBatch(
  db: DbLike,
  lectureId: string,
  segments: PromptSegment[],
  batch: readonly DraftRequest[],
): Promise<{ records: ItemRecord[]; model: string }> {
  const { output, model } = await runTask(
    draftItemsTask,
    {
      segments,
      concepts: batch.map(({ concept: c }) => ({
        canonicalKey: c.canonicalKey,
        name: c.name,
        summary: c.summary,
        keyPoints: c.keyPoints.map(({ id, text }) => ({ id, text })),
      })),
      requests: batch.map((r) => ({
        conceptKey: r.concept.canonicalKey,
        mcq: r.mcq,
        spotFlaw: r.spotFlaw,
        transfer: 0,
      })),
    },
    await pipelineAi(db, lectureId),
  )
  return { records: toItemRecords(output), model }
}

/** Inserts drafts (items + item_secrets); variants continue after the concept's existing ones. */
async function insertDrafts(
  db: DbLike,
  lectureId: string,
  batch: readonly DraftRequest[],
  drafts: { records: ItemRecord[]; model: string },
): Promise<number> {
  const idByKey = new Map(batch.map((r) => [r.concept.canonicalKey, r.concept.id]))
  const records = drafts.records.filter((r) => idByKey.has(r.conceptKey))
  if (records.length === 0) return 0
  const conceptIds = [...new Set(records.map((r) => idByKey.get(r.conceptKey) ?? ''))]
  const existing = await db
    .select({ conceptId: items.conceptId, kind: items.kind, n: count() })
    .from(items)
    .where(inArray(items.conceptId, conceptIds))
    .groupBy(items.conceptId, items.kind)
  const used = new Map(existing.map((r) => [`${r.conceptId}:${r.kind}`, r.n]))
  const rows = records.map((r) => {
    const conceptId = idByKey.get(r.conceptKey) ?? ''
    const slot = `${conceptId}:${r.kind}`
    const variant = (used.get(slot) ?? 0) + 1
    used.set(slot, variant)
    return { id: uuidv7(), conceptId, record: r, variant }
  })
  await db.transaction(async (tx) => {
    await tx.insert(items).values(
      rows.map(({ id, conceptId, record, variant }) => ({
        id,
        conceptId,
        lectureId,
        kind: record.kind,
        variant,
        status: 'draft' as const,
        publicPayload: record.publicPayload,
        segmentIdxs: [...record.segmentIdxs],
        promptVersion: draftItemsTask.promptVersion,
        model: drafts.model,
      })),
    )
    await tx.insert(itemSecrets).values(
      rows.map(({ id, record }) => ({
        itemId: id,
        answerKey: record.answerKey,
        distractorMeta: record.distractorMeta,
        rubric: record.rubric,
        hints: record.hints,
        leakKeywords: [...record.leakKeywords],
      })),
    )
  })
  return rows.length
}

/** Draft batches (4 concepts each) run in parallel; a batch already stored is skipped on retry. */
export async function draftItemsStep(
  db: DbLike,
  lectureId: string,
): Promise<{ concepts: number; items: number }> {
  return runStep(db, lectureId, 'draftItems', async () => {
    const all = await lectureConcepts(db, lectureId)
    const drafted = await draftedConcepts(db, lectureId)
    const pending: DraftRequest[] = all
      .map((concept, rank) => ({
        concept,
        mcq: MCQ_PER_CONCEPT,
        spotFlaw: rank < PRACTICE_CONCEPTS ? SPOT_FLAW_PER_PRACTICE_CONCEPT : SPOT_FLAW_PER_CONCEPT,
      }))
      .filter((r) => !drafted.has(r.concept.id))
    if (pending.length === 0) return { concepts: all.length, items: 0 }
    const segments = await promptSegments(db, lectureId)
    const counts = await mapLimit(
      chunk(pending, DRAFT_BATCH_CONCEPTS),
      MAX_PARALLEL_CALLS,
      async (batch) =>
        insertDrafts(db, lectureId, batch, await draftBatch(db, lectureId, segments, batch)),
    )
    return { concepts: all.length, items: counts.reduce((a, b) => a + b, 0) }
  })
}

interface DraftRow {
  id: string
  kind: ItemKind
  publicPayload: unknown
  segmentIdxs: number[]
  answerKey: unknown
}

const INVALID_VERIFIER_OUTPUT = 'the verifier’s output failed validation twice'

async function setVerdict(db: DbLike, itemId: string, verification: ItemVerification) {
  await db
    .update(items)
    .set({ status: verification.verdict === 'pass' ? 'verified' : 'rejected', verification })
    .where(and(eq(items.id, itemId), eq(items.status, 'draft')))
}

/** Blind-solves up to 4 drafts in one verifier call and stores each verdict. */
async function verifyBatch(
  db: DbLike,
  lectureId: string,
  segments: PromptSegment[],
  batch: readonly DraftRow[],
): Promise<void> {
  const blind: VerifyItem[] = batch.map((i) => ({
    ref: i.id,
    kind: i.kind,
    publicPayload: i.publicPayload,
    segmentIdxs: i.segmentIdxs,
  }))
  try {
    const { output, model } = await runTask(
      verifyItemsTask,
      { segments, items: blind },
      await pipelineAi(db, lectureId),
    )
    const byRef = new Map(output.results.map((r) => [r.ref, r]))
    await Promise.all(
      batch.map(async (item, i) => {
        const solution = byRef.get(item.id)
        const verification = solution
          ? toVerification(blind[i] as VerifyItem, item.answerKey as AnswerKey, solution, model)
          : { verdict: 'fail' as const, solvedAnswer: null, reasons: ['no verdict'], model }
        await setVerdict(db, item.id, verification)
      }),
    )
  } catch (err) {
    // An unverifiable item is never shown: reject the batch rather than fail the lecture.
    if (!(err instanceof FatalTaskError)) throw err
    const verification = {
      verdict: 'fail' as const,
      solvedAnswer: null,
      reasons: [INVALID_VERIFIER_OUTPUT],
      model: verifyItemsTask.name,
    }
    await Promise.all(batch.map((item) => setVerdict(db, item.id, verification)))
  }
}

/** Every draft of this lecture gets a verdict (idempotent: only `draft` rows are touched). */
async function verifyDrafts(db: DbLike, lectureId: string, segments: PromptSegment[]) {
  const drafts: DraftRow[] = await db
    .select({
      id: items.id,
      kind: items.kind,
      publicPayload: items.publicPayload,
      segmentIdxs: items.segmentIdxs,
      answerKey: itemSecrets.answerKey,
    })
    .from(items)
    .innerJoin(itemSecrets, eq(itemSecrets.itemId, items.id))
    .where(and(eq(items.lectureId, lectureId), eq(items.status, 'draft')))
    .orderBy(asc(items.id))
  await mapLimit(chunk(drafts, VERIFY_BATCH_ITEMS), MAX_PARALLEL_CALLS, (batch) =>
    verifyBatch(db, lectureId, segments, batch),
  )
}

/** One redraft round for the rejected items (same concept and kind). A bad redraft is skipped. */
async function redraftRejected(db: DbLike, lectureId: string, segments: PromptSegment[]) {
  const rejected = await db
    .select({ conceptId: items.conceptId, kind: items.kind, n: count() })
    .from(items)
    .where(and(eq(items.lectureId, lectureId), eq(items.status, 'rejected')))
    .groupBy(items.conceptId, items.kind)
  const lecture = await lectureConcepts(db, lectureId)
  const requests = lecture.flatMap((concept): DraftRequest[] => {
    const n = (kind: ItemKind) =>
      rejected.find((r) => r.conceptId === concept.id && r.kind === kind)?.n ?? 0
    const request = { concept, mcq: n('diagnostic_mcq'), spotFlaw: n('spot_flaw') }
    return request.mcq + request.spotFlaw > 0 ? [request] : []
  })
  const batches = chunk(requests, DRAFT_BATCH_CONCEPTS)
  const drafts = await mapLimit(batches, MAX_PARALLEL_CALLS, (batch) =>
    draftBatch(db, lectureId, segments, batch).catch((err: unknown) => {
      if (err instanceof FatalTaskError) return null
      throw err
    }),
  )
  for (const [i, batch] of batches.entries()) {
    const draft = drafts[i]
    if (draft) await insertDrafts(db, lectureId, batch, draft)
  }
  return requests.length
}

/** Logs concepts left with fewer verified MCQs than the diagnostic's follow-up needs. */
async function warnThinConcepts(db: DbLike, lectureId: string): Promise<void> {
  const verified = await db
    .select({ conceptId: items.conceptId, n: count() })
    .from(items)
    .where(
      and(
        eq(items.lectureId, lectureId),
        eq(items.kind, 'diagnostic_mcq'),
        eq(items.status, 'verified'),
      ),
    )
    .groupBy(items.conceptId)
  const counts = new Map(verified.map((v) => [v.conceptId, v.n]))
  const thin = (await lectureConcepts(db, lectureId))
    .filter((c) => (counts.get(c.id) ?? 0) < MIN_VERIFIED_MCQS)
    .map((c) => c.canonicalKey)
  if (thin.length > 0) {
    console.warn(JSON.stringify({ event: 'few_verified_mcqs', lectureId, concepts: thin }))
  }
}

/**
 * Verify → at most one redraft round for rejections → verify the redrafts. The round is recorded
 * in the step output so a retried step never redrafts twice.
 * ponytail: a crash between storing the redrafts and the flag would redraft once more; the
 * extra drafts are verified like any other (bounded cost, never shown unverified).
 */
export async function verifyItemsStep(
  db: DbLike,
  lectureId: string,
): Promise<{ verified: number; rejected: number }> {
  return runStep(db, lectureId, 'verifyItems', async () => {
    const segments = await promptSegments(db, lectureId)
    await verifyDrafts(db, lectureId, segments)
    const { redrafted } = await stepOutput<{ redrafted: boolean }>(db, lectureId, 'verifyItems')
    if (!redrafted) {
      const redraftedConcepts = await redraftRejected(db, lectureId, segments)
      await mergeStepOutput(db, lectureId, 'verifyItems', { redrafted: true })
      if (redraftedConcepts > 0) await verifyDrafts(db, lectureId, segments)
    }
    const totals = await db
      .select({ status: items.status, n: count() })
      .from(items)
      .where(and(eq(items.lectureId, lectureId), inArray(items.status, ['verified', 'rejected'])))
      .groupBy(items.status)
    const of = (s: string) => totals.find((t) => t.status === s)?.n ?? 0
    await warnThinConcepts(db, lectureId)
    return { verified: of('verified'), rejected: of('rejected') }
  })
}
