import type {
  AttemptActivityType,
  ConfidenceLevel,
  MasteryState,
  Outcome,
} from '@lectheo/contracts'
import { ACTIVITY_LABELS, labelTypes } from './activity-labels'
import { type Timestamp, toEpochMs } from './time'

/** One graded attempt for a (user, concept), mapped from the `attempts` table. */
export interface MasteryAttempt {
  readonly activityType: AttemptActivityType
  readonly outcome: Outcome
  /** Diagnostic only; null for practice activities. */
  readonly confidence: ConfidenceLevel | null
  /** Hints used or explanation shown before this attempt (practice only). */
  readonly assisted: boolean
  /** Diagnostic follow-up question (F3.5). */
  readonly isFollowUp: boolean
  readonly createdAt: Timestamp
  readonly itemId?: string | null
  readonly diagnosticSessionId?: string | null
}

export interface MasteryResult {
  readonly state: MasteryState
  readonly confidentMistake: boolean
  /** Tooltip lines explaining the state (F6.1). */
  readonly reasons: readonly string[]
}

/** F6 green: independent correct answers in at least this many distinct activity types. */
export const GREEN_MIN_ACTIVITY_TYPES = 2
/** "sure + wrong twice" (Architecture §6.2) makes a confident mistake. */
export const CONFIDENT_MISTAKE_REPEATS = 2

export const MASTERY_REASONS = {
  notTested: 'Not tested yet',
  confidentMistake: 'Confident mistake: you were sure, but the answer was wrong',
  clearConfidentMistake: 'An independent correct answer will clear it',
  needsPractice: 'Needs an independent correct answer in a practice activity',
  needsAnotherType: 'Needs an independent correct answer in another activity type',
  notYetCorrect: 'No correct answers yet',
} as const

interface Indexed {
  readonly attempt: MasteryAttempt
  readonly i: number
}

/**
 * Independent (F6, Architecture §6.2): a diagnostic answer given with confidence `sure`, or a
 * practice attempt without hints or a shown explanation. The Socratic guiding question does not
 * count as help, so a correct unassisted retry is independent.
 */
export function isIndependent(attempt: MasteryAttempt): boolean {
  return attempt.activityType === 'diagnostic' ? attempt.confidence === 'sure' : !attempt.assisted
}

function isConfidentWrong(attempt: MasteryAttempt): boolean {
  return (
    attempt.activityType === 'diagnostic' &&
    attempt.confidence === 'sure' &&
    attempt.outcome === 'incorrect'
  )
}

/** Valid attempts (outcome ≠ invalid) in chronological order; ties keep input order. */
function chronological(attempts: readonly MasteryAttempt[]): MasteryAttempt[] {
  return attempts
    .filter((a) => a.outcome !== 'invalid')
    .map((attempt, order) => ({ attempt, order, t: toEpochMs(attempt.createdAt) }))
    .sort((a, b) => a.t - b.t || a.order - b.order)
    .map(({ attempt }) => attempt)
}

/**
 * Positions (in chronological order) where a confident mistake became established
 * (Architecture §6.2): a core sure+wrong answer whose follow-up was also wrong, or that has no
 * follow-up; or the second sure+wrong answer overall ("sure+wrong twice").
 */
function confidentMistakePositions(sorted: readonly MasteryAttempt[]): number[] {
  const indexed: Indexed[] = sorted.map((attempt, i) => ({ attempt, i }))
  const usedFollowUps = new Set<number>()
  const positions: number[] = []

  for (const { attempt, i } of indexed) {
    if (!isConfidentWrong(attempt) || attempt.isFollowUp) continue
    const followUp = indexed.find(
      (x) =>
        x.i > i &&
        x.attempt.activityType === 'diagnostic' &&
        x.attempt.isFollowUp &&
        !usedFollowUps.has(x.i) &&
        sameSession(attempt, x.attempt),
    )
    if (!followUp) {
      positions.push(i)
      continue
    }
    usedFollowUps.add(followUp.i)
    if (followUp.attempt.outcome === 'incorrect') positions.push(followUp.i)
  }

  const confidentWrong = indexed.filter((x) => isConfidentWrong(x.attempt))
  const repeated = confidentWrong[CONFIDENT_MISTAKE_REPEATS - 1]
  if (repeated) positions.push(repeated.i)
  return positions
}

function sameSession(a: MasteryAttempt, b: MasteryAttempt): boolean {
  if (!a.diagnosticSessionId || !b.diagnosticSessionId) return true
  return a.diagnosticSessionId === b.diagnosticSessionId
}

/**
 * Computes a concept's mastery state from the user's attempts (F6, Architecture §6.2).
 * Pure; computed on read, no cache. `invalid` outcomes (rejected Stump questions) are ignored.
 *
 * - none → gray
 * - latest attempt incorrect → red
 * - unresolved confident mistake (no independent correct after it) → red, `confidentMistake`
 * - independent correct answers in ≥ 2 activity types, at least one not the MCQ diagnostic,
 *   with nothing wrong since (F6 "and nothing wrong since") → green
 * - any correct or partial → amber; otherwise red
 *
 * F6.2: a single correct answer can never make a node green.
 */
export function computeMastery(attempts: readonly MasteryAttempt[]): MasteryResult {
  const sorted = chronological(attempts)
  const last = sorted.at(-1)
  if (!last) return { state: 'gray', confidentMistake: false, reasons: [MASTERY_REASONS.notTested] }

  const unresolved = confidentMistakePositions(sorted).filter(
    (pos) => !sorted.some((a, i) => i > pos && a.outcome === 'correct' && isIndependent(a)),
  )
  const confidentMistake = unresolved.length > 0
  const cmReasons = confidentMistake
    ? [MASTERY_REASONS.confidentMistake, MASTERY_REASONS.clearConfidentMistake]
    : []

  if (last.outcome === 'incorrect') {
    const wrong = `Most recent answer was wrong (${ACTIVITY_LABELS[last.activityType]})`
    return { state: 'red', confidentMistake, reasons: [wrong, ...cmReasons] }
  }
  if (confidentMistake) return { state: 'red', confidentMistake, reasons: cmReasons }

  const lastIncorrect = sorted.findLastIndex((a) => a.outcome === 'incorrect')
  const strong = new Set(
    sorted
      .filter((a, i) => i > lastIncorrect && a.outcome === 'correct' && isIndependent(a))
      .map((a) => a.activityType),
  )
  const hasNonMcq = [...strong].some((type) => type !== 'diagnostic')
  if (strong.size >= GREEN_MIN_ACTIVITY_TYPES && hasNonMcq) {
    return { state: 'green', confidentMistake: false, reasons: [`Correct in ${labelTypes(strong)}`] }
  }

  if (sorted.some((a) => a.outcome === 'correct' || a.outcome === 'partial')) {
    return { state: 'amber', confidentMistake: false, reasons: amberReasons(sorted, strong) }
  }
  return { state: 'red', confidentMistake: false, reasons: [MASTERY_REASONS.notYetCorrect] }
}

function amberReasons(
  sorted: readonly MasteryAttempt[],
  strong: ReadonlySet<AttemptActivityType>,
): string[] {
  const typesWhere = (pred: (a: MasteryAttempt) => boolean): Set<AttemptActivityType> =>
    new Set(sorted.filter(pred).map((a) => a.activityType))

  const helped = typesWhere((a) => a.outcome === 'correct' && !isIndependent(a))
  const partial = typesWhere((a) => a.outcome === 'partial')
  const unsureRight = helped.has('diagnostic')
  helped.delete('diagnostic')

  const reasons: string[] = []
  if (strong.size > 0) reasons.push(`Correct in ${labelTypes(strong)}`)
  if (unsureRight) reasons.push('Right in Diagnostic, but not sure')
  if (helped.size > 0) reasons.push(`Correct with help in ${labelTypes(helped)}`)
  if (partial.size > 0) reasons.push(`Partly correct in ${labelTypes(partial)}`)
  const onlyMcq = strong.size === 0 || (strong.size === 1 && strong.has('diagnostic'))
  reasons.push(onlyMcq ? MASTERY_REASONS.needsPractice : MASTERY_REASONS.needsAnotherType)
  return reasons
}

export interface MasterySummary {
  readonly gray: number
  readonly red: number
  readonly amber: number
  readonly green: number
}

/** Counts concepts per state for course cards (`MasteryCounts`, F0.4). */
export function summarizeMastery(states: readonly MasteryState[]): MasterySummary {
  const initial: MasterySummary = { gray: 0, red: 0, amber: 0, green: 0 }
  return states.reduce<MasterySummary>((acc, state) => ({ ...acc, [state]: acc[state] + 1 }), initial)
}

/** Activity types with at least one independent correct answer (used by the recommender). */
export function independentCorrectTypes(
  attempts: readonly MasteryAttempt[],
): ReadonlySet<AttemptActivityType> {
  return new Set(
    attempts
      .filter((a) => a.outcome === 'correct' && isIndependent(a))
      .map((a) => a.activityType),
  )
}
