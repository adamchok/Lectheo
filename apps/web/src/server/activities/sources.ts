import type { SourceRef } from '@lectheo/contracts'
import { and, asc, conceptOccurrences, desc, eq, inArray, transcriptSegments } from '@lectheo/db'
import type { DbLike } from '../db'
import type { ConceptRow, ItemRow } from './types'

/* SourceRef building (F5.2): "▶ 12:41 · excerpt" links for feedback and explanations. */

export const EXCERPT_CHARS = 140
const MAX_SOURCES = 3

export function excerpt(text: string, max = EXCERPT_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`
}

/** Segments `idxs` of one lecture → SourceRef[] in idx order (unknown idxs are skipped). */
export async function buildSources(
  db: DbLike,
  lectureId: string,
  idxs: readonly number[],
  limit = MAX_SOURCES,
): Promise<SourceRef[]> {
  const wanted = [...new Set(idxs)].slice(0, limit)
  if (wanted.length === 0) return []
  const rows = await db
    .select()
    .from(transcriptSegments)
    .where(
      and(eq(transcriptSegments.lectureId, lectureId), inArray(transcriptSegments.idx, wanted)),
    )
    .orderBy(asc(transcriptSegments.idx))
  return rows.map((s) => ({
    lectureId,
    idx: s.idx,
    startMs: s.startMs,
    excerpt: excerpt(s.editedText ?? s.text),
  }))
}

export const itemSources = (db: DbLike, item: ItemRow): Promise<SourceRef[]> =>
  buildSources(db, item.lectureId, item.segmentIdxs)

/**
 * Concept grounding: key-point segments in the concept's first lecture, else the most salient
 * occurrence. ponytail: key points don't carry a lecture id; they cite the first lecture.
 */
export async function conceptSources(db: DbLike, concept: ConceptRow): Promise<SourceRef[]> {
  const keyPointIdxs = concept.keyPoints.flatMap((k) => k.segmentIdxs)
  if (concept.firstLectureId && keyPointIdxs.length > 0) {
    const refs = await buildSources(db, concept.firstLectureId, keyPointIdxs)
    if (refs.length > 0) return refs
  }
  const [occ] = await db
    .select()
    .from(conceptOccurrences)
    .where(eq(conceptOccurrences.conceptId, concept.id))
    .orderBy(desc(conceptOccurrences.salience))
    .limit(1)
  return occ ? buildSources(db, occ.lectureId, occ.segmentIdxs) : []
}

/** The default grounding of an activity: its item when it has one, else its concept. */
export const activitySources = (
  db: DbLike,
  concept: ConceptRow,
  item: ItemRow | null,
): Promise<SourceRef[]> => (item ? itemSources(db, item) : conceptSources(db, concept))
