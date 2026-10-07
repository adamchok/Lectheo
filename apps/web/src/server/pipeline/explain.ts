import { explainConceptsTask, runTask, toDepths } from '@lectheo/ai'
import { and, asc, conceptOccurrences, concepts, eq, inArray } from '@lectheo/db'
import type { DbLike } from '../db'
import { pipelineAi } from './items'
import { loadSegments } from './segments'
import { runStep } from './state'

/*
 * explainConcepts (Product Spec F9.13–F9.15, Architecture §4.3): one reasoner call per lecture,
 * in parallel with draftItems/verifyItems. It writes concepts.depth only for the concepts this
 * lecture introduces, so a later lecture never overwrites an earlier one's explanation. The
 * workflow swallows its failure: depth stays null and the Study brief hides the disclosure.
 */

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

export async function explainConceptsStep(
  db: DbLike,
  lectureId: string,
): Promise<{ concepts: number; explained: number }> {
  return runStep(db, lectureId, 'explainConcepts', async () => {
    const list = await newConcepts(db, lectureId)
    if (list.length === 0) return { concepts: 0, explained: 0 }
    const ids = list.map((c) => c.id)
    // Re-processing replaces: an old explanation may cite segments that no longer exist.
    await db.update(concepts).set({ depth: null }).where(inArray(concepts.id, ids))

    const segments = await loadSegments(db, lectureId)
    const cited = new Set(
      list.flatMap((c) => [...c.segmentIdxs, ...c.keyPoints.flatMap((k) => k.segmentIdxs)]),
    )
    const { output } = await runTask(
      explainConceptsTask,
      {
        segments: segments.filter((s) => cited.has(s.idx)).map(({ idx, text }) => ({ idx, text })),
        // ADR-009: names, summaries and key points only; nothing from item_secrets.
        concepts: list.map((c) => ({
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
      new Set(list.map((c) => c.key)),
      new Set(segments.map((s) => s.idx)),
    )
    for (const c of list) {
      const depth = depths.get(c.key)
      if (!depth) continue
      await db
        .update(concepts)
        .set({ depth })
        .where(and(eq(concepts.id, c.id), eq(concepts.firstLectureId, lectureId)))
    }
    return { concepts: list.length, explained: depths.size }
  })
}
