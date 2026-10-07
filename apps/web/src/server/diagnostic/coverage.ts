import type { DiagnosticResultsResponse } from '@lectheo/contracts'
import { and, concepts, conceptOccurrences, eq, inArray, items, lectures } from '@lectheo/db'
import { diagnosticCoverage, homeChapterIndex, learningOrder } from '@lectheo/domain'
import type { DbLike } from '../db'
import { loadPrerequisites } from '../lectures/brief'
import { loadMasteryForUser } from '../mastery'
import { fromLectureOrIntroducer } from './shared'

type LectureRow = typeof lectures.$inferSelect
type ChapteredLecture = Pick<LectureRow, 'id' | 'courseId' | 'chapters' | 'hasTimestamps'>

export interface DiagnosticConcept {
  readonly conceptId: string
  readonly firstLectureId: string | null
  /** Home chapter (0-based), null without chapters (F3.9). */
  readonly chapterIndex: number | null
}

/** Chapters as the study brief shows them: none without timestamps. */
const chaptersOf = (lecture: ChapteredLecture) =>
  lecture.hasTimestamps ? (lecture.chapters ?? []) : []

/**
 * The lecture's concepts in learning order (F9.2: prerequisites first, then first appearance),
 * each with the chapter of its first segment in this lecture.
 */
export async function diagnosticConcepts(
  db: DbLike,
  lecture: ChapteredLecture,
): Promise<DiagnosticConcept[]> {
  const [rows, prerequisites] = await Promise.all([
    db
      .select({
        id: concepts.id,
        firstLectureId: concepts.firstLectureId,
        segmentIdxs: conceptOccurrences.segmentIdxs,
      })
      .from(conceptOccurrences)
      .innerJoin(concepts, eq(concepts.id, conceptOccurrences.conceptId))
      .where(eq(conceptOccurrences.lectureId, lecture.id)),
    loadPrerequisites(db, lecture.courseId),
  ])
  const chapters = chaptersOf(lecture)
  const starts = chapters.map((c) => c.startIdx)
  const firstIdx = (idxs: readonly number[]) => (idxs.length > 0 ? Math.min(...idxs) : 0)
  // No segment in this lecture: the first chapter that lists it, as the study brief does.
  const chapterOf = (id: string, idxs: readonly number[]): number | null =>
    idxs.length === 0 && chapters.length > 0
      ? Math.max(
          0,
          chapters.findIndex((ch) => ch.conceptIds.includes(id)),
        )
      : homeChapterIndex(starts, firstIdx(idxs))
  const byId = new Map(rows.map((r) => [r.id, r]))
  const order = learningOrder(
    rows.map((r) => ({ id: r.id, firstIdx: firstIdx(r.segmentIdxs) })),
    prerequisites.map((p) => ({ from: p.of, to: p.id, relation: 'depends_on' })),
  )
  return order.flatMap((id) => {
    const row = byId.get(id)
    if (!row) return []
    const chapterIndex = chapterOf(id, row.segmentIdxs)
    return [{ conceptId: id, firstLectureId: row.firstLectureId, chapterIndex }]
  })
}

/** Concept ids not *Not tested* for this user (mastery computed on read, never cached). */
export async function testedConceptIds(
  db: DbLike,
  userId: string,
  conceptIds: readonly string[],
): Promise<Set<string>> {
  const mastery = await loadMasteryForUser(db, userId, conceptIds)
  return new Set(conceptIds.filter((id) => mastery.get(id)?.state !== 'gray'))
}

/** F3.10–F3.11: how much of the lecture this user has tested, overall and per chapter. */
export async function loadCoverage(
  db: DbLike,
  userId: string,
  lecture: ChapteredLecture,
): Promise<DiagnosticResultsResponse['coverage']> {
  const list = await diagnosticConcepts(db, lecture)
  const ids = list.map((c) => c.conceptId)
  if (ids.length === 0) {
    return { tested: 0, total: 0, noQuestion: 0, untested: 0, byChapter: [] }
  }
  const [tested, verified] = await Promise.all([
    testedConceptIds(db, userId, ids),
    // Same scope as Test the rest: a recurring concept's questions live where it was introduced.
    db
      .selectDistinct({ conceptId: items.conceptId })
      .from(items)
      .where(
        and(
          inArray(items.conceptId, ids),
          eq(items.kind, 'diagnostic_mcq'),
          eq(items.status, 'verified'),
          fromLectureOrIntroducer(lecture.id),
        ),
      ),
  ])
  const hasQuestion = new Set(verified.map((r) => r.conceptId))
  const coverage = diagnosticCoverage(
    list.map((c) => ({
      ...c,
      tested: tested.has(c.conceptId),
      hasQuestion: hasQuestion.has(c.conceptId),
    })),
  )
  const chapters = chaptersOf(lecture)
  return {
    ...coverage,
    byChapter: coverage.byChapter.flatMap(({ chapterIndex, tested: t, total }) => {
      const chapter = chapters[chapterIndex]
      return chapter
        ? [
            {
              chapterId: chapter.id,
              number: chapterIndex + 1,
              title: chapter.title,
              tested: t,
              total,
            },
          ]
        : []
    }),
  }
}
