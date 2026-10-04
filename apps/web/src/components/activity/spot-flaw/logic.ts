import type { MasteryState, Outcome, SubmitResponse } from '@lectheo/contracts'

/* Pure spot-the-flaw UI rules (unit-tested in logic.test.ts). */

export type Verdict = 'flawed' | 'correct'

export interface Answer {
  readonly verdict: Verdict | null
  readonly flawSentenceIdx: number | null
  readonly correction: string
}

export const EMPTY_ANSWER: Answer = { verdict: null, flawSentenceIdx: null, correction: '' }
export const CORRECTION_MAX = 1000

/** Clicking a sentence means "this one is flawed"; choosing "correct" clears the pick. */
export function pickSentence(answer: Answer, idx: number): Answer {
  return { ...answer, verdict: 'flawed', flawSentenceIdx: idx }
}

export function pickVerdict(answer: Answer, verdict: Verdict): Answer {
  return verdict === 'correct'
    ? { ...answer, verdict, flawSentenceIdx: null }
    : { ...answer, verdict }
}

/** Why the answer can't be submitted yet, or null when it can. */
export function submitBlocker(answer: Answer): string | null {
  if (answer.verdict === null) return 'Choose Flawed or Correct.'
  if (answer.verdict === 'correct') return null
  if (answer.flawSentenceIdx === null) return 'Pick the sentence you think is wrong.'
  if (answer.correction.trim() === '') return 'Write what the sentence should say.'
  return null
}

/** API body (POST …/submit); the correction only travels with a flawed verdict. */
export function submitBody(answer: Answer) {
  if (answer.verdict === 'correct') return { verdict: 'correct' as const }
  return {
    verdict: 'flawed' as const,
    ...(answer.flawSentenceIdx === null ? {} : { flawSentenceIdx: answer.flawSentenceIdx }),
    correction: answer.correction.trim().slice(0, CORRECTION_MAX),
  }
}

export const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  correct: 'Correct',
  partial: 'Partly right',
  incorrect: 'Not yet',
  invalid: 'Not graded',
}

/** "Correction 1/2" style rows: code checks first, then judged criteria. */
export interface ScoreRow {
  readonly id: string
  readonly label: string
  readonly ok: boolean
  readonly detail: string
}

export function scoreRows(result: Pick<SubmitResponse, 'checks' | 'criteria'>): ScoreRow[] {
  const rows: ScoreRow[] = []
  if (result.checks) {
    rows.push({
      id: 'verdict',
      label: 'Verdict',
      ok: result.checks.verdict,
      detail: result.checks.verdict ? '2/2' : '0/2',
    })
    if (result.checks.location !== null) {
      rows.push({
        id: 'location',
        label: 'Flawed sentence',
        ok: result.checks.location,
        detail: result.checks.location ? '2/2' : '0/2',
      })
    }
  }
  for (const c of result.criteria) {
    rows.push({ id: c.id, label: c.label, ok: c.score >= c.max, detail: `${c.score}/${c.max}` })
  }
  return rows
}

const MASTERY_STATES: readonly MasteryState[] = ['gray', 'red', 'amber', 'green']

export function parseMasteryState(value: string | null | undefined): MasteryState | null {
  return MASTERY_STATES.find((s) => s === value) ?? null
}

/** States the concept went through: start (if known) then each try, consecutive repeats merged. */
export function masteryTrail(
  start: MasteryState | null,
  tries: readonly MasteryState[],
): MasteryState[] {
  return [start, ...tries]
    .filter((s): s is MasteryState => s !== null)
    .filter((s, i, all) => i === 0 || all[i - 1] !== s)
}
