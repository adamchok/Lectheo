import type { ActivityType, MasteryState, NextStepResponse, Relation } from '@lectheo/contracts'
import { type MasteryAttempt, independentCorrectTypes } from './mastery'
import { type Timestamp, toEpochMs } from './time'

/** Architecture §6.3 priority weights. */
export const PRIORITY_WEIGHTS = {
  confidentMistake: 100,
  red: 60,
  markedLost: 40,
  amber: 25,
  prerequisiteOfRed: 10,
  practicedRecently: -15,
} as const

/** "practicedInLast10Min" window. */
export const RECENT_PRACTICE_WINDOW_MS = 10 * 60 * 1000

/** Practice order (Architecture §6.3); transfer and stump only when enabled. */
export const PRACTICE_ORDER: readonly ActivityType[] = ['spot_flaw', 'teach_back', 'transfer', 'stump']

export interface EnabledActivities {
  readonly transfer?: boolean
  readonly stump?: boolean
}

export interface ConceptSignal {
  readonly conceptId: string
  readonly conceptName: string
  readonly state: MasteryState
  readonly confidentMistake: boolean
  readonly markedLost: boolean
  readonly prerequisiteOfRed: boolean
  /** Latest practice attempt on this concept, if any. */
  readonly lastPracticedAt: Timestamp | null
}

export interface RankedConcept {
  readonly conceptId: string
  readonly conceptName: string
  readonly state: MasteryState
  readonly confidentMistake: boolean
  readonly priority: number
}

/** Architecture §6.3 priority formula for one concept. */
export function conceptPriority(signal: ConceptSignal, now: Timestamp): number {
  const nowMs = toEpochMs(now)
  const last = signal.lastPracticedAt === null ? null : toEpochMs(signal.lastPracticedAt)
  const sinceMs = last === null ? null : nowMs - last
  const practicedRecently = sinceMs !== null && sinceMs >= 0 && sinceMs < RECENT_PRACTICE_WINDOW_MS
  const w = PRIORITY_WEIGHTS
  return (
    (signal.confidentMistake ? w.confidentMistake : 0) +
    (signal.state === 'red' ? w.red : 0) +
    (signal.markedLost ? w.markedLost : 0) +
    (signal.state === 'amber' ? w.amber : 0) +
    (signal.prerequisiteOfRed ? w.prerequisiteOfRed : 0) +
    (practicedRecently ? w.practicedRecently : 0)
  )
}

/**
 * Orders concepts for practice (F4 order, Architecture §6.3): highest priority first; ties keep
 * input order (pass concepts in map/lecture order). Mastered (green) concepts are excluded.
 */
export function rankConcepts(signals: readonly ConceptSignal[], now: Timestamp): RankedConcept[] {
  return signals
    .filter((s) => s.state !== 'green')
    .map((s, order) => ({
      ranked: {
        conceptId: s.conceptId,
        conceptName: s.conceptName,
        state: s.state,
        confidentMistake: s.confidentMistake,
        priority: conceptPriority(s, now),
      },
      order,
    }))
    .sort((a, b) => b.ranked.priority - a.ranked.priority || a.order - b.order)
    .map(({ ranked }) => ranked)
}

export interface PrerequisiteEdge {
  readonly from: string
  readonly to: string
  readonly relation: Relation
}

/**
 * Concepts that are a direct prerequisite of a red concept (F2.5). An edge
 * `from depends_on to` makes `to` a prerequisite of `from`.
 */
export function prerequisitesOfRed(
  edges: readonly PrerequisiteEdge[],
  redConceptIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    edges
      .filter((e) => e.relation === 'depends_on' && redConceptIds.has(e.from))
      .map((e) => e.to),
  )
}

/**
 * Next practice activity for a concept (Architecture §6.3): the first of
 * [spot_flaw, teach_back, transfer*, stump*] without an independent correct answer.
 * When every enabled type already has one, returns the first enabled type (keep practicing).
 */
export function nextActivityType(
  attempts: readonly MasteryAttempt[],
  enabled: EnabledActivities = {},
): ActivityType {
  const done = independentCorrectTypes(attempts)
  const available = PRACTICE_ORDER.filter((t) => isEnabled(t, enabled))
  return available.find((t) => !done.has(t)) ?? available[0] ?? 'spot_flaw'
}

function isEnabled(type: ActivityType, enabled: EnabledActivities): boolean {
  if (type === 'transfer') return enabled.transfer === true
  if (type === 'stump') return enabled.stump === true
  return true
}

export interface LectureRef {
  readonly lectureId: string
  readonly title: string
}

export interface NextStepInput {
  /** Library lectures the user hasn't watched yet, in course order. */
  readonly unwatchedLibraryLectures: readonly LectureRef[]
  /** Watched / processed lectures with no completed diagnostic, in course order. */
  readonly pendingDiagnostics: readonly LectureRef[]
  /** Output of `rankConcepts`. */
  readonly rankedConcepts: readonly RankedConcept[]
  /** Activity type for the top concept (from `nextActivityType`). */
  readonly topConceptActivity?: ActivityType
}

/**
 * Dashboard "Next step" card (F0.4, Architecture §6.3): unwatched library lecture → pending
 * diagnostic → top-priority concept → none. Shape matches `NextStepResponse`.
 */
export function dashboardNextStep(input: NextStepInput): NextStepResponse {
  const lecture = input.unwatchedLibraryLectures[0]
  if (lecture) {
    return {
      kind: 'watch',
      lectureId: lecture.lectureId,
      reason: `${lecture.title} is ready. Watch it and tap when you're lost.`,
    }
  }
  const pending = input.pendingDiagnostics[0]
  if (pending) {
    return {
      kind: 'diagnostic',
      lectureId: pending.lectureId,
      reason: `Check what stuck from ${pending.title} with a quick diagnostic.`,
    }
  }
  const top = input.rankedConcepts[0]
  if (top) {
    return {
      kind: 'activity',
      conceptId: top.conceptId,
      conceptName: top.conceptName,
      activityType: input.topConceptActivity ?? 'spot_flaw',
      reason: conceptReason(top),
    }
  }
  return { kind: 'none', reason: 'All caught up. Add a lecture or revisit the map.' }
}

function conceptReason(top: RankedConcept): string {
  if (top.confidentMistake) {
    return `You were sure about ${top.conceptName}, but got it wrong. Let's fix that.`
  }
  if (top.state === 'red') return `${top.conceptName} needs work.`
  if (top.state === 'amber') return `${top.conceptName} is getting there. One more independent win.`
  return `Practice ${top.conceptName}.`
}
