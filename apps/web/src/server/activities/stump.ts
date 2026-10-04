import { runTask, stumpAnswerTask, stumpRefereeTask, type StumpRefereeOutput } from '@lectheo/ai'
import type { SourceRef, StumpResult } from '@lectheo/contracts'
import { and, asc, conceptOccurrences, desc, eq, inArray, transcriptSegments } from '@lectheo/db'
import { STUMP_MAX_TRIES, stumpOutcome } from '@lectheo/domain'
import type { DbLike } from '../db'
import { buildSources, conceptSources } from './sources'
import type { ActivityContext, ActivityTypeHandler, ConceptRow, GradingResult } from './types'

/*
 * Stump the AI (F4d, beta; Architecture §4.7). Referee pass 1 validates the student's question +
 * key → answerer (Sonnet) answers WITHOUT the key → referee pass 2 compares → aiStumped.
 * A rejected question is outcome `invalid` (ignored by mastery) and the student may revise, up to
 * STUMP_MAX_TRIES submits. Accepted = `correct`, with no points (F6.3).
 */

/** Lecture context for the referee and answerer: the concept's segments, capped. */
const MAX_SEGMENTS = 40

export const guidanceFor = (concept: Pick<ConceptRow, 'name' | 'summary'>): string =>
  `Write one hard question about ${concept.name} and your own answer key. ${concept.summary} ` +
  'A referee checks that the question is on this concept, has one clear answer, and that your ' +
  'key is right. Then the AI answers without seeing your key. Good stumpers test an edge case, ' +
  'a "why", or a tricky trace — not trivia.'

interface ConceptSegments {
  readonly lectureId: string | null
  readonly segments: { idx: number; text: string }[]
}

/**
 * The concept's lecture segments: key-point and occurrence segments in its first lecture (or its
 * most salient occurrence's lecture). Works for library and user-processed lectures alike.
 */
export async function conceptSegments(db: DbLike, concept: ConceptRow): Promise<ConceptSegments> {
  const occurrences = await db
    .select()
    .from(conceptOccurrences)
    .where(eq(conceptOccurrences.conceptId, concept.id))
    .orderBy(desc(conceptOccurrences.salience))
  const lectureId = concept.firstLectureId ?? occurrences[0]?.lectureId ?? null
  if (!lectureId) return { lectureId: null, segments: [] }
  const idxs = new Set([
    ...concept.keyPoints.flatMap((k) => k.segmentIdxs),
    ...occurrences.filter((o) => o.lectureId === lectureId).flatMap((o) => o.segmentIdxs),
  ])
  if (idxs.size === 0) return { lectureId, segments: [] }
  const rows = await db
    .select()
    .from(transcriptSegments)
    .where(
      and(
        eq(transcriptSegments.lectureId, lectureId),
        inArray(transcriptSegments.idx, [...idxs].slice(0, MAX_SEGMENTS)),
      ),
    )
    .orderBy(asc(transcriptSegments.idx))
  return { lectureId, segments: rows.map((s) => ({ idx: s.idx, text: s.editedText ?? s.text })) }
}

/** Code decides validity from the checks too, so a referee "valid" with a failed check loses. */
export const isAccepted = (o: StumpRefereeOutput): boolean =>
  o.valid && o.onConcept && o.unambiguous && o.answerable && o.keyCorrect

async function refereeSources(
  ctx: ActivityContext,
  lectureId: string | null,
  verdict: StumpRefereeOutput,
): Promise<SourceRef[]> {
  const cited =
    lectureId && verdict.segmentIdxs.length > 0
      ? await buildSources(ctx.db, lectureId, verdict.segmentIdxs)
      : []
  return cited.length > 0 ? cited : conceptSources(ctx.db, ctx.concept)
}

function graded(stump: StumpResult, judgeModel: string, sources: SourceRef[]): GradingResult {
  const { outcome } = stumpOutcome({ valid: stump.valid, aiStumped: stump.aiStumped })
  return {
    checks: null,
    criteria: [],
    score: 0,
    maxScore: 0,
    outcome,
    feedback: { guidingQuestion: null, hint: null },
    rationale: stump.refereeNotes,
    judgeModel,
    sources,
    stump,
  }
}

export const stumpHandler: ActivityTypeHandler<'stump'> = {
  type: 'stump',
  turnBudget: 0,
  hintsAvailable: 0,
  maxTries: STUMP_MAX_TRIES,

  async start(ctx) {
    return {
      itemId: null,
      rubricSnapshot: { kind: 'key_points', keyPoints: ctx.concept.keyPoints },
      persona: null,
      // GET /activities/{id} has no guidance field; the view reads it from the first message.
      initialMessages: [{ role: 'persona', content: guidanceFor(ctx.concept) }],
    }
  },

  async publicStart(ctx) {
    return { guidance: guidanceFor(ctx.concept) }
  },

  async submit(ctx, body) {
    const { lectureId, segments } = await conceptSegments(ctx.db, ctx.concept)
    const base = {
      conceptName: ctx.concept.name,
      segments,
      question: body.question,
      answerKey: body.answerKey,
    }
    const check = await runTask(
      stumpRefereeTask,
      { ...base, mode: 'validate', aiAnswer: null },
      ctx.ai,
    )
    const groundedIn = check.output.usesCourseKnowledge ? 'course_knowledge' : 'lecture'
    const sources = await refereeSources(ctx, lectureId, check.output)
    if (!isAccepted(check.output)) {
      const reason = check.output.reason
      const stump: StumpResult = {
        valid: false,
        rejectionReason: reason,
        aiAnswer: null,
        aiStumped: false,
        refereeNotes: reason,
        groundedIn,
      }
      return graded(stump, check.model, sources)
    }
    // ADR-009: the answerer input type has no key field; only the question goes over.
    const answer = await runTask(
      stumpAnswerTask,
      { conceptName: ctx.concept.name, segments, question: body.question },
      ctx.ai,
    )
    const aiAnswer = answer.output.answer
    const compare = await runTask(stumpRefereeTask, { ...base, mode: 'compare', aiAnswer }, ctx.ai)
    const stump: StumpResult = {
      valid: true,
      rejectionReason: null,
      aiAnswer,
      aiStumped: compare.output.aiCorrect === false,
      refereeNotes: compare.output.reason,
      groundedIn,
    }
    return graded(stump, compare.model, sources)
  },

  async explanation(ctx) {
    return { explanation: ctx.concept.summary, sources: await conceptSources(ctx.db, ctx.concept) }
  },

  async finalReveal(ctx) {
    return { explanation: ctx.concept.summary, rubric: [] }
  },
}
