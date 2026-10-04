import type { Outcome } from '@lectheo/contracts'

// ---------- Spot the flaw (F4c.6) ----------

export const SPOT_FLAW_VERDICT_POINTS = 2
export const SPOT_FLAW_LOCATION_POINTS = 2
export const SPOT_FLAW_CORRECTION_MAX = 2
/** Flawed scenario: verdict 2 + location 2 + correction 0–2. */
export const SPOT_FLAW_MAX_FLAWED =
  SPOT_FLAW_VERDICT_POINTS + SPOT_FLAW_LOCATION_POINTS + SPOT_FLAW_CORRECTION_MAX
/** Correct (no-flaw) scenario: verdict only. */
export const SPOT_FLAW_MAX_CORRECT = SPOT_FLAW_VERDICT_POINTS
/** Flawed scenario bands: correct ≥ 5/6, partial 3–4, incorrect ≤ 2. */
export const SPOT_FLAW_CORRECT_MIN = 5
export const SPOT_FLAW_PARTIAL_MIN = 3

export interface SpotFlawTruth {
  readonly hasFlaw: boolean
  readonly flawSentenceIdx: number | null
}

export interface SpotFlawSubmission {
  readonly verdict: 'flawed' | 'correct'
  readonly flawSentenceIdx?: number | null
}

export interface SpotFlawChecks {
  readonly verdictCorrect: boolean
  /** null for a no-flaw scenario (location is not asked). */
  readonly locationCorrect: boolean | null
  /** Call the AI judge for the correction only when the scenario is flawed and the verdict right. */
  readonly needsJudge: boolean
  /** Points from the exact code checks (verdict + location). */
  readonly codeScore: number
  readonly maxScore: number
}

export interface ScoredOutcome {
  readonly score: number
  readonly maxScore: number
  readonly outcome: Outcome
}

/**
 * Exact code checks for a spot-the-flaw submission (F4c.5–F4c.6): verdict and sentence location.
 * If the verdict is wrong the judge is not needed and location/correction score 0.
 */
export function checkSpotFlaw(truth: SpotFlawTruth, submission: SpotFlawSubmission): SpotFlawChecks {
  const verdictCorrect = (submission.verdict === 'flawed') === truth.hasFlaw
  if (!truth.hasFlaw) {
    return {
      verdictCorrect,
      locationCorrect: null,
      needsJudge: false,
      codeScore: verdictCorrect ? SPOT_FLAW_VERDICT_POINTS : 0,
      maxScore: SPOT_FLAW_MAX_CORRECT,
    }
  }
  const locationCorrect =
    verdictCorrect && submission.flawSentenceIdx != null && submission.flawSentenceIdx === truth.flawSentenceIdx
  return {
    verdictCorrect,
    locationCorrect,
    needsJudge: verdictCorrect,
    codeScore: (verdictCorrect ? SPOT_FLAW_VERDICT_POINTS : 0) + (locationCorrect ? SPOT_FLAW_LOCATION_POINTS : 0),
    maxScore: SPOT_FLAW_MAX_FLAWED,
  }
}

/**
 * Final spot-the-flaw score and outcome band (F4c.6). `correctionScore` is the judge's 0–2 for
 * the correction; it is ignored (counted as 0) when `checks.needsJudge` is false.
 * @throws RangeError if a needed correction score is outside 0–2.
 */
export function scoreSpotFlaw(checks: SpotFlawChecks, correctionScore: number | null = null): ScoredOutcome {
  if (checks.maxScore === SPOT_FLAW_MAX_CORRECT) {
    const score = checks.codeScore
    return { score, maxScore: checks.maxScore, outcome: score === checks.maxScore ? 'correct' : 'incorrect' }
  }
  const correction = checks.needsJudge ? validCorrection(correctionScore) : 0
  const score = checks.codeScore + correction
  return { score, maxScore: checks.maxScore, outcome: spotFlawBand(score) }
}

function validCorrection(value: number | null): number {
  if (value === null || !Number.isFinite(value) || value < 0 || value > SPOT_FLAW_CORRECTION_MAX) {
    throw new RangeError(`correctionScore must be 0–${SPOT_FLAW_CORRECTION_MAX}, got ${String(value)}`)
  }
  return value
}

/** Outcome band for a flawed-scenario score out of 6 (F4c.6). */
export function spotFlawBand(score: number): Outcome {
  if (score >= SPOT_FLAW_CORRECT_MIN) return 'correct'
  if (score >= SPOT_FLAW_PARTIAL_MIN) return 'partial'
  return 'incorrect'
}

// ---------- Rubric-graded activities: teach-back (F4a.3), transfer (F4b.2) ----------

/** Share of rubric points needed for `correct`. */
export const RUBRIC_CORRECT_RATIO = 0.8
/** Share of rubric points needed for `partial`. */
export const RUBRIC_PARTIAL_RATIO = 0.5

export interface CriterionScore {
  readonly score: number
  readonly max: number
}

/**
 * Totals per-criterion judge scores (each key point 0–2 for teach-back, rubric criteria for
 * transfer) and bands the ratio: correct ≥ 80 %, partial ≥ 50 %, else incorrect.
 * Scores are clamped to [0, max]. No criteria → incorrect with 0/0.
 */
export function rubricOutcome(criteria: readonly CriterionScore[]): ScoredOutcome {
  const maxScore = criteria.reduce((sum, c) => sum + Math.max(0, c.max), 0)
  const score = criteria.reduce((sum, c) => sum + Math.min(Math.max(0, c.score), Math.max(0, c.max)), 0)
  if (maxScore === 0) return { score: 0, maxScore: 0, outcome: 'incorrect' }
  const ratio = score / maxScore
  const outcome: Outcome =
    ratio >= RUBRIC_CORRECT_RATIO ? 'correct' : ratio >= RUBRIC_PARTIAL_RATIO ? 'partial' : 'incorrect'
  return { score, maxScore, outcome }
}

/** Teach-back outcome from key-point coverage scores (F4a.3, Architecture §4.6). */
export function teachBackOutcome(keyPointScores: readonly CriterionScore[]): ScoredOutcome {
  return rubricOutcome(keyPointScores)
}

// ---------- Stump the AI (F4d) ----------

export interface StumpResult {
  readonly outcome: Outcome
  readonly label: string
  /** True when the question counts toward mastery as a non-MCQ activity type (F4d.4). */
  readonly countsForMastery: boolean
}

/** Submits per Stump activity: a rejected question can be revised until this many (F4d.2). */
export const STUMP_MAX_TRIES = 3

export const STUMP_LABELS = {
  accepted: 'Accepted',
  stumped: 'Accepted · you stumped the AI',
  rejected: 'Not accepted',
} as const

/**
 * Stump outcome (F4d.2–F4d.4, Architecture §4.7). Rejected by the referee → `invalid` (no mastery
 * effect). Accepted → `correct` whether or not the AI was stumped; there are no points.
 */
export function stumpOutcome(input: { readonly valid: boolean; readonly aiStumped: boolean }): StumpResult {
  if (!input.valid) return { outcome: 'invalid', label: STUMP_LABELS.rejected, countsForMastery: false }
  return {
    outcome: 'correct',
    label: input.aiStumped ? STUMP_LABELS.stumped : STUMP_LABELS.accepted,
    countsForMastery: true,
  }
}
