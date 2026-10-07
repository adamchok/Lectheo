import { explainConceptsTask, runTask, toDepths } from '@lectheo/ai'
import { and, asc, conceptOccurrences, concepts, eq, inArray } from '@lectheo/db'
import type { DbLike } from '../db'
import { chunk, mapLimit, MAX_PARALLEL_CALLS, pipelineAi } from './items'
import { loadSegments, type LectureSegment } from './segments'
import { runStep } from './state'

/*
 * explainConcepts (Product Spec F9.13–F9.15, Architecture §4.3): reasoner calls in batches of 6
 * concepts, in parallel with draftItems/verifyItems. It writes concepts.depth only for the
 * concepts this lecture introduces, so a later lecture never overwrites an earlier one's
 * explanation. A failed batch only leaves its own concepts without depth; the workflow swallows a
 * failure of the whole step, so the Study brief just hides the disclosure.
 */

/** ~450 words each: 6 concepts stay well inside the 16k output budget with reasoning. */
export const EXPLAIN_BATCH_CONCEPTS = 6

/** This lecture's new concepts (first_lecture_id = it) with their segments here. */
const newConcepts = (db: DbLike, lectureId: string) =>
  db
    .select({
      id: concepts.id,
      key: concepts.canonicalKey,
      name: concepts.name,
      summary: concepts.summary,
      keyPoints: concepts.keyPoints,
      segmentIdxs: conceptOccurrences.segmentIdxs,
    })
    .from(conceptOccurrences)
    .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
    .where(and(eq(conceptOccurrences.lectureId, lectureId), eq(concepts.firstLectureId, lectureId)))
    .orderBy(asc(concepts.canonicalKey))

type NewConcept = Awaited<ReturnType<typeof newConcepts>>[number]

/** One call for a batch; writes the valid depths and returns how many. Never throws. */
async function explainBatch(
  db: DbLike,
  lectureId: string,
  batch: readonly NewConcept[],
  segments: readonly LectureSegment[],
): Promise<number> {
  const cited = new Set(
    batch.flatMap((c) => [...c.segmentIdxs, ...c.keyPoints.flatMap((k) => k.segmentIdxs)]),
  )
  try {
    const { output } = await runTask(
      explainConceptsTask,
      {
        segments: segments.filter((s) => cited.has(s.idx)).map(({ idx, text }) => ({ idx, text })),
        // ADR-009: names, summaries and key points only; nothing from item_secrets.
        concepts: batch.map((c) => ({
          key: c.key,
          name: c.name,
          summary: c.summary,
          keyPoints: c.keyPoints.map((k) => k.text),
          segmentIdxs: c.segmentIdxs,
        })),
      },
      await pipelineAi(db, lectureId),
    )
    const depths = toDepths(
      output,
      new Set(batch.map((c) => c.key)),
      new Set(segments.map((s) => s.idx)),
    )
    for (const c of batch) {
      const depth = depths.get(c.key)
      if (!depth) continue
      await db
        .update(concepts)
        .set({ depth })
        .where(and(eq(concepts.id, c.id), eq(concepts.firstLectureId, lectureId)))
    }
    return depths.size
  } catch (err) {
    // Depth is extra (F9.15): this batch's concepts go without it, the others keep theirs.
    const reason = err instanceof Error ? err.name : 'unknown'
    console.warn(
      JSON.stringify({ event: 'explain_batch_failed', lectureId, concepts: batch.length, reason }),
    )
    return 0
  }
}

export async function explainConceptsStep(
  db: DbLike,
  lectureId: string,
): Promise<{ concepts: number; explained: number }> {
  return runStep(db, lectureId, 'explainConcepts', async () => {
    const list = await newConcepts(db, lectureId)
    if (list.length === 0) return { concepts: 0, explained: 0 }
    // Re-processing replaces: an old explanation may cite segments that no longer exist.
    await db
      .update(concepts)
      .set({ depth: null })
      .where(
        inArray(
          concepts.id,
          list.map((c) => c.id),
        ),
      )
    const segments = await loadSegments(db, lectureId)
    const counts = await mapLimit(
      chunk(list, EXPLAIN_BATCH_CONCEPTS),
      MAX_PARALLEL_CALLS,
      (batch) => explainBatch(db, lectureId, batch, segments),
    )
    return { concepts: list.length, explained: counts.reduce((a, b) => a + b, 0) }
  })
}
