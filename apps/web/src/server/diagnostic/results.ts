import type { DiagnosticResultsResponse, Finding } from '@lectheo/contracts'
import { concepts, eq, inArray, lectures } from '@lectheo/db'
import { NO_FLAGS_NOTE, orderFindings, resolveSessionFindings } from '@lectheo/domain'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { loadCoverage } from './coverage'
import {
  itemSource,
  loadItems,
  loadOwnedSession,
  loadResponses,
  markerCountsByConcept,
} from './shared'

const count = (findings: readonly { finding: Finding }[], ...kinds: Finding[]): number =>
  findings.filter((f) => kinds.includes(f.finding)).length

/**
 * GET /diagnostic/{sid}/results (F3.6): answered questions resolved with their follow-ups,
 * ordered confident mistakes → wrong → unsure-right → right, plus the lecture's coverage (F3.10).
 */
export async function getResults(
  actor: Actor,
  sid: string,
  db: DbLike = appDb(),
): Promise<DiagnosticResultsResponse> {
  const session = await loadOwnedSession(db, actor, sid)
  const position = new Map(session.plannedItemIds.map((id, i) => [id, i]))
  const answered = (await loadResponses(db, session.id))
    .filter((r) => r.optionId !== null && r.correct !== null)
    .sort(
      (a, b) =>
        (a.answeredAt?.getTime() ?? 0) - (b.answeredAt?.getTime() ?? 0) ||
        (position.get(a.itemId) ?? 0) - (position.get(b.itemId) ?? 0),
    )
  const byId = await loadItems(
    db,
    answered.map((r) => r.itemId),
  )
  const resolved = resolveSessionFindings(
    answered.map((r) => ({
      itemId: r.itemId,
      conceptId: byId.get(r.itemId)?.conceptId ?? '',
      correct: r.correct === true,
      confidence: r.confidence,
      isFollowUp: r.isFollowUp,
    })),
  )

  const conceptIds = [...new Set(resolved.map((f) => f.conceptId))]
  const names = new Map(
    conceptIds.length === 0
      ? []
      : (
          await db
            .select({ id: concepts.id, name: concepts.name })
            .from(concepts)
            .where(inArray(concepts.id, conceptIds))
        ).map((c) => [c.id, c.name]),
  )
  const findings = await Promise.all(
    resolved.map(async (f) => {
      const item = byId.get(f.itemId)
      return {
        itemId: f.itemId,
        conceptId: f.conceptId,
        conceptName: names.get(f.conceptId) ?? '',
        finding: f.finding,
        confidence: f.confidence,
        source: item ? await itemSource(db, item) : null,
      }
    }),
  )

  const [counts, coverage] = await Promise.all([
    markerCountsByConcept(db, actor.userId, session.lectureId),
    lectureCoverage(db, actor.userId, session.lectureId),
  ])
  const hasMarkers = [...counts.values()].some((c) => c.lostCount > 0 || c.importantCount > 0)
  return {
    findings: orderFindings(findings),
    summary: {
      total: findings.length,
      confidentMistakes: count(findings, 'confident_mistake'),
      wrong: count(findings, 'wrong'),
      // A possible slip was right on the follow-up, so it counts with unsure-but-right.
      unsureRight: count(findings, 'unsure_right', 'possible_slip'),
      right: count(findings, 'right'),
    },
    ...(hasMarkers ? {} : { note: NO_FLAGS_NOTE }),
    coverage,
  }
}

/** The session's lecture was read-checked by loadOwnedSession. */
async function lectureCoverage(db: DbLike, userId: string, lectureId: string) {
  const [lecture] = await db
    .select({
      id: lectures.id,
      courseId: lectures.courseId,
      chapters: lectures.chapters,
      hasTimestamps: lectures.hasTimestamps,
    })
    .from(lectures)
    .where(eq(lectures.id, lectureId))
  if (!lecture) throw new Error(`lecture ${lectureId} missing`)
  return loadCoverage(db, userId, lecture)
}
