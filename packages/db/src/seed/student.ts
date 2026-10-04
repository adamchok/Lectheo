import {
  AttemptGrading,
  KeyPoints,
  MessageGuard,
  RubricSecret,
  RubricSnapshot,
} from '@lectheo/contracts'
import type * as s from '../schema'
import { ITEMS, LECTURES } from './library'
import type { FlawFx, ItemFx, TransferFx } from './fixtures/types'
import { SEED_STUDENT_ID, conceptId, itemId, lectureId, studentRowId, type LectureKey } from './ids'
import { studentScript, type ActivityPlan, type DiagnosticPlan } from './fixtures/student-script'

/**
 * The seed student's "lived-in" per-user rows (Product Spec F0.3, Data Model §3). clone_sample()
 * copies exactly these tables. All ids are stable (studentRowId) and all times are offsets from
 * `baseDate`, so re-seeding with the same base date is a no-op.
 */
export const DEFAULT_SEED_BASE_DATE = new Date('2026-10-04T12:00:00.000Z')
export const SEED_STUDENT_NAME = 'Sample student'
export const TEACH_BACK_PERSONA = 'curious_first_year'
export const FIXTURE_JUDGE_MODEL = 'fixture-judge'
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert']

export interface StudentRows {
  profile: Insert<typeof s.profiles>
  markers: Insert<typeof s.markers>[]
  markerConcepts: Insert<typeof s.markerConcepts>[]
  sessions: Insert<typeof s.diagnosticSessions>[]
  responses: Insert<typeof s.diagnosticResponses>[]
  activities: Insert<typeof s.activities>[]
  messages: Insert<typeof s.messages>[]
  attempts: Insert<typeof s.attempts>[]
}

const findItem = <K extends ItemFx['kind']>(
  concept: string,
  kind: K,
  variant: number,
): Extract<ItemFx, { kind: K }> => {
  const item = ITEMS.find((i) => i.concept === concept && i.kind === kind && i.variant === variant)
  if (!item) throw new Error(`seed student: no ${kind} v${variant} for ${concept}`)
  return item as Extract<ItemFx, { kind: K }>
}

const keyPointsOf = (concept: string): KeyPoints => {
  for (const lecture of LECTURES) {
    const c = lecture.concepts.find((x) => x.key === concept)
    if (c)
      return KeyPoints.parse(
        c.keyPoints.map((kp) => ({ id: kp.id, text: kp.text, segmentIdxs: kp.segs })),
      )
  }
  throw new Error(`seed student: unknown concept ${concept}`)
}

const lectureOfConcept = (concept: string): LectureKey => {
  const lecture = LECTURES.find((l) => l.concepts.some((c) => c.key === concept))
  if (!lecture) throw new Error(`seed student: unknown concept ${concept}`)
  return lecture.key
}

const itemRubric = (item: FlawFx | TransferFx): RubricSecret => RubricSecret.parse(item.rubric)

/** A typical author reply that passed the leak check without escalation. */
const passedGuard = (latencyMs: number): MessageGuard =>
  MessageGuard.parse({
    regexHit: false,
    jev: { revealsLocation: 0.04, revealsCorrection: 0.02, maxP: 0.04, latencyMs },
    escalated: false,
    escalationVerdict: null,
    regenerated: false,
  })

const outcomeFor = (score: number, max: number): 'correct' | 'partial' | 'incorrect' => {
  if (max === 6) return score >= 5 ? 'correct' : score >= 3 ? 'partial' : 'incorrect'
  const ratio = score / max
  return ratio >= 0.8 ? 'correct' : ratio >= 0.5 ? 'partial' : 'incorrect'
}

class Clock {
  constructor(private readonly base: Date) {}
  /** `hoursAgo` hours before the base date, plus `minutes`. */
  at(hoursAgo: number, minutes = 0): Date {
    return new Date(this.base.getTime() - hoursAgo * HOUR_MS + minutes * MINUTE_MS)
  }
}

const buildDiagnostic = (plan: DiagnosticPlan, clock: Clock, rows: StudentRows): void => {
  const sessionId = studentRowId(`diagnostic:${plan.lecture}`)
  const core = plan.answers.filter((a) => !a.followUp)
  const answeredAt = (i: number) => clock.at(plan.hoursAgo, 1 + i * 1.5)
  rows.sessions.push({
    id: sessionId,
    userId: SEED_STUDENT_ID,
    lectureId: lectureId(plan.lecture),
    plannedItemIds: core.map((a) => itemId(a.concept, 'diagnostic_mcq', a.variant)),
    followUpsUsed: plan.answers.length - core.length,
    status: 'completed',
    createdAt: clock.at(plan.hoursAgo),
    completedAt: answeredAt(plan.answers.length),
  })
  plan.answers.forEach((a, i) => {
    const item = findItem(a.concept, 'diagnostic_mcq', a.variant)
    const correctId = item.answerKey.correctOptionId
    const optionId = a.correct ? correctId : a.chose
    if (!optionId || (!a.correct && optionId === correctId)) {
      throw new Error(`seed student: ${a.concept} v${a.variant} needs a wrong option`)
    }
    const misconception = a.correct ? undefined : item.distractorMeta?.[optionId]?.misconception
    const id = itemId(a.concept, 'diagnostic_mcq', a.variant)
    rows.responses.push({
      sessionId,
      itemId: id,
      isFollowUp: a.followUp ?? false,
      confidence: a.confidence,
      optionsRevealedAt: clock.at(plan.hoursAgo, 0.5 + i * 1.5),
      optionId,
      correct: a.correct,
      answeredAt: answeredAt(i),
    })
    rows.attempts.push({
      id: studentRowId(`attempt:diagnostic:${plan.lecture}:${id}`),
      userId: SEED_STUDENT_ID,
      conceptId: conceptId(a.concept),
      activityType: 'diagnostic',
      diagnosticSessionId: sessionId,
      itemId: id,
      tryNo: 1,
      final: true,
      confidence: a.confidence,
      response: { optionId },
      grading: AttemptGrading.parse({
        checks: { verdict: a.correct, location: null },
        criteria: [],
        rationale: null,
        ...(misconception ? { misconceptions: [misconception] } : {}),
      }),
      score: a.correct ? 1 : 0,
      maxScore: 1,
      outcome: a.correct ? 'correct' : 'incorrect',
      assisted: false,
      judgeModel: null,
      createdAt: answeredAt(i),
    })
  })
}

/** F4c.6: verdict 2 + location 2 + correction 0–2 (the judged rubric, scaled to 0–2). */
const flawCriteria = (item: FlawFx, correctionScore: number) => {
  const criteria = [{ id: 'verdict', label: 'Verdict', score: 2, max: 2 }]
  if (!item.answerKey.hasFlaw) return criteria
  return [
    ...criteria,
    { id: 'location', label: 'Flawed sentence', score: 2, max: 2 },
    { id: 'correction', label: 'Correction', score: correctionScore, max: 2 },
  ]
}

const buildActivity = (plan: ActivityPlan, clock: Clock, rows: StudentRows): void => {
  const activityId = studentRowId(`activity:${plan.key}`)
  const start = clock.at(plan.hoursAgo)
  const item =
    plan.type === 'spot_flaw'
      ? findItem(plan.concept, 'spot_flaw', plan.variant ?? 1)
      : plan.type === 'transfer'
        ? findItem(plan.concept, 'transfer', plan.variant ?? 1)
        : null
  const rubricSnapshot = RubricSnapshot.parse(
    item
      ? { kind: 'item', rubric: itemRubric(item as FlawFx | TransferFx) }
      : { kind: 'key_points', keyPoints: keyPointsOf(plan.concept) },
  )
  const studentTurns = plan.messages.filter((m) => m.role === 'student').length
  rows.activities.push({
    id: activityId,
    userId: SEED_STUDENT_ID,
    conceptId: conceptId(plan.concept),
    type: plan.type,
    itemId: item ? itemId(plan.concept, item.kind, item.variant) : null,
    persona: plan.type === 'teach_back' ? TEACH_BACK_PERSONA : null,
    status: 'closed',
    turnsUsed: studentTurns,
    turnBudget: 6,
    hintsUsed: plan.hintsUsed ?? 0,
    explanationShown: true,
    rubricSnapshot,
    createdAt: start,
  })
  plan.messages.forEach((m, i) => {
    rows.messages.push({
      id: studentRowId(`message:${plan.key}:${i}`),
      activityId,
      role: m.role,
      content: m.content,
      visible: true,
      guard: plan.type === 'spot_flaw' && m.role === 'persona' ? passedGuard(150 + i * 20) : null,
      createdAt: new Date(start.getTime() + (i + 1) * MINUTE_MS),
    })
  })
  const afterMessages = start.getTime() + (plan.messages.length + 1) * MINUTE_MS
  plan.tries.forEach((t, i) => {
    const isFinal = i === plan.tries.length - 1
    let criteria: { id: string; label: string; score: number; max: number }[]
    let response: unknown
    if (plan.type === 'spot_flaw') {
      const flawItem = item as FlawFx
      criteria = flawCriteria(flawItem, t.correctionScore ?? 2)
      response = flawItem.answerKey.hasFlaw
        ? {
            verdict: 'flawed',
            flawSentenceIdx: flawItem.answerKey.flawSentenceIdx,
            correction: t.answer,
          }
        : { verdict: 'correct' }
    } else if (plan.type === 'transfer') {
      const rubric = itemRubric(item as TransferFx)
      criteria = rubric.criteria.map((c, j) => ({
        id: c.id,
        label: c.label,
        score: t.scores?.[j] ?? 2,
        max: c.max,
      }))
      response = { answer: t.answer }
    } else {
      criteria = keyPointsOf(plan.concept).map((kp, j) => ({
        id: kp.id,
        label: kp.text,
        score: t.scores?.[j] ?? 2,
        max: 2,
      }))
      response = {}
    }
    const score = criteria.reduce((sum, c) => sum + c.score, 0)
    const maxScore = criteria.reduce((sum, c) => sum + c.max, 0)
    const checks =
      plan.type === 'spot_flaw'
        ? { verdict: true, location: (item as FlawFx).answerKey.hasFlaw ? true : null }
        : null
    rows.attempts.push({
      id: studentRowId(`attempt:${plan.key}:${i + 1}`),
      userId: SEED_STUDENT_ID,
      conceptId: conceptId(plan.concept),
      activityType: plan.type,
      activityId,
      itemId: item ? itemId(plan.concept, item.kind, item.variant) : null,
      tryNo: i + 1,
      final: isFinal,
      confidence: null,
      response,
      grading: AttemptGrading.parse({
        checks,
        criteria,
        rationale: t.rationale,
        guidingQuestion: isFinal ? null : (t.guidingQuestion ?? null),
      }),
      score,
      maxScore,
      outcome: outcomeFor(score, maxScore),
      assisted: (plan.hintsUsed ?? 0) > 0,
      judgeModel: FIXTURE_JUDGE_MODEL,
      createdAt: new Date(afterMessages + i * 3 * MINUTE_MS),
    })
  })
}

/** Pure: builds every per-user row of the seed student for a given base date. */
export function buildStudentRows(baseDate: Date = DEFAULT_SEED_BASE_DATE): StudentRows {
  const clock = new Clock(baseDate)
  const rows: StudentRows = {
    profile: {
      id: SEED_STUDENT_ID,
      kind: 'seed',
      displayName: SEED_STUDENT_NAME,
      timezone: 'UTC',
      createdAt: clock.at(24 * 7),
    },
    markers: [],
    markerConcepts: [],
    sessions: [],
    responses: [],
    activities: [],
    messages: [],
    attempts: [],
  }
  studentScript.markers.forEach((m, i) => {
    const id = studentRowId(`marker:${m.lecture}:${i}`)
    rows.markers.push({
      id,
      lectureId: lectureId(m.lecture),
      userId: SEED_STUDENT_ID,
      kind: m.kind,
      tMs: m.tMs,
      capture: 'watch',
      deletedAt: null,
      createdAt: clock.at(m.hoursAgo),
    })
    if (m.concept) {
      if (lectureOfConcept(m.concept) !== m.lecture) {
        throw new Error(`seed student: marker concept ${m.concept} is not in ${m.lecture}`)
      }
      rows.markerConcepts.push({
        markerId: id,
        conceptId: conceptId(m.concept),
        overlapScore: m.overlap ?? 0.8,
      })
    }
  })
  studentScript.diagnostics.forEach((d) => buildDiagnostic(d, clock, rows))
  studentScript.activities.forEach((a) => buildActivity(a, clock, rows))
  return rows
}
