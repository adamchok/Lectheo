import { describe, expect, it } from 'vitest'
import {
  MASTERY_REASONS,
  type MasteryAttempt,
  computeMastery,
  independentCorrectTypes,
  isIndependent,
  summarizeMastery,
} from './mastery'

let clock = 0
/** Builds an attempt with a strictly increasing timestamp. */
function attempt(overrides: Partial<MasteryAttempt>): MasteryAttempt {
  clock += 1000
  return {
    activityType: 'spot_flaw',
    outcome: 'correct',
    confidence: null,
    assisted: false,
    isFollowUp: false,
    createdAt: new Date(clock),
    ...overrides,
  }
}
const diag = (outcome: MasteryAttempt['outcome'], confidence: MasteryAttempt['confidence'], extra: Partial<MasteryAttempt> = {}) =>
  attempt({ activityType: 'diagnostic', outcome, confidence, ...extra })

describe('isIndependent', () => {
  it('requires "sure" in the diagnostic and no help in practice', () => {
    expect(isIndependent(diag('correct', 'sure'))).toBe(true)
    expect(isIndependent(diag('correct', 'unsure'))).toBe(false)
    expect(isIndependent(attempt({ assisted: false }))).toBe(true)
    expect(isIndependent(attempt({ assisted: true }))).toBe(false)
  })
})

describe('computeMastery', () => {
  it('is gray with no attempts', () => {
    expect(computeMastery([])).toEqual({ state: 'gray', confidentMistake: false, reasons: [MASTERY_REASONS.notTested] })
  })

  it('ignores invalid (rejected Stump) attempts', () => {
    expect(computeMastery([attempt({ activityType: 'stump', outcome: 'invalid' })]).state).toBe('gray')
  })

  it('F6.2: one correct answer never turns a node green', () => {
    expect(computeMastery([attempt({ activityType: 'spot_flaw' })]).state).toBe('amber')
    expect(computeMastery([diag('correct', 'sure')]).state).toBe('amber')
  })

  it('is green with independent corrects in diagnostic and spot the flaw', () => {
    const result = computeMastery([diag('correct', 'sure'), attempt({ activityType: 'spot_flaw' })])
    expect(result).toEqual({
      state: 'green',
      confidentMistake: false,
      reasons: ['Correct in Diagnostic and Spot the flaw'],
    })
  })

  it('is not green when both independent corrects are in the same type', () => {
    const result = computeMastery([attempt({}), attempt({})])
    expect(result.state).toBe('amber')
    expect(result.reasons).toContain(MASTERY_REASONS.needsAnotherType)
  })

  it('is not green when the second correct was assisted', () => {
    const result = computeMastery([diag('correct', 'sure'), attempt({ activityType: 'teach_back', assisted: true })])
    expect(result.state).toBe('amber')
    expect(result.reasons).toContain('Correct with help in Teach-back')
  })

  it('is not green when the diagnostic answer was unsure', () => {
    const result = computeMastery([diag('correct', 'unsure'), attempt({ activityType: 'spot_flaw' })])
    expect(result.state).toBe('amber')
    expect(result.reasons).toContain('Right in Diagnostic, but not sure')
  })

  it('counts an accepted Stump as a non-MCQ type', () => {
    expect(computeMastery([attempt({ activityType: 'stump' }), attempt({ activityType: 'teach_back' })]).state).toBe('green')
  })

  it('is red when the latest attempt is wrong, even after earlier greens', () => {
    const result = computeMastery([
      diag('correct', 'sure'),
      attempt({ activityType: 'spot_flaw' }),
      attempt({ activityType: 'teach_back', outcome: 'incorrect' }),
    ])
    expect(result.state).toBe('red')
    expect(result.reasons[0]).toBe('Most recent answer was wrong (Teach-back)')
  })

  it('needs fresh corrects after a wrong answer ("nothing wrong since")', () => {
    const result = computeMastery([
      diag('correct', 'sure'),
      attempt({ activityType: 'spot_flaw', outcome: 'incorrect' }),
      attempt({ activityType: 'teach_back' }),
    ])
    expect(result.state).toBe('amber')
  })

  it('flags a sure+wrong answer with no follow-up as a confident mistake', () => {
    const result = computeMastery([diag('incorrect', 'sure')])
    expect(result).toMatchObject({ state: 'red', confidentMistake: true })
  })

  it('flags sure+wrong followed by a wrong follow-up as a confident mistake', () => {
    const result = computeMastery([
      diag('incorrect', 'sure', { diagnosticSessionId: 's1' }),
      diag('incorrect', 'unsure', { isFollowUp: true, diagnosticSessionId: 's1' }),
    ])
    expect(result).toMatchObject({ state: 'red', confidentMistake: true })
  })

  it('treats a right follow-up as a possible slip, not a confident mistake', () => {
    const result = computeMastery([
      diag('incorrect', 'sure', { diagnosticSessionId: 's1' }),
      diag('correct', 'sure', { isFollowUp: true, diagnosticSessionId: 's1' }),
    ])
    expect(result.confidentMistake).toBe(false)
    expect(result.state).toBe('amber')
  })

  it('flags sure+wrong twice across sessions even when each follow-up was right', () => {
    const result = computeMastery([
      diag('incorrect', 'sure', { diagnosticSessionId: 's1' }),
      diag('correct', 'unsure', { isFollowUp: true, diagnosticSessionId: 's1' }),
      diag('incorrect', 'sure', { diagnosticSessionId: 's2' }),
      diag('correct', 'unsure', { isFollowUp: true, diagnosticSessionId: 's2' }),
    ])
    expect(result).toMatchObject({ state: 'red', confidentMistake: true })
  })

  it('keeps a confident mistake red after an assisted correct', () => {
    const result = computeMastery([diag('incorrect', 'sure'), attempt({ assisted: true })])
    expect(result).toMatchObject({ state: 'red', confidentMistake: true })
    expect(result.reasons).toContain(MASTERY_REASONS.confidentMistake)
  })

  it('clears a confident mistake after an independent correct', () => {
    const result = computeMastery([diag('incorrect', 'sure'), attempt({ activityType: 'spot_flaw' })])
    expect(result).toMatchObject({ state: 'amber', confidentMistake: false })
  })

  it('reaches green after clearing a confident mistake in two types', () => {
    const result = computeMastery([
      diag('incorrect', 'sure'),
      attempt({ activityType: 'spot_flaw' }),
      attempt({ activityType: 'teach_back' }),
    ])
    expect(result.state).toBe('green')
    expect(result.reasons).toEqual(['Correct in Spot the flaw and Teach-back'])
  })

  it('is amber for a partial answer', () => {
    const result = computeMastery([attempt({ outcome: 'partial' })])
    expect(result.state).toBe('amber')
    expect(result.reasons).toContain('Partly correct in Spot the flaw')
  })

  it('orders by createdAt, not input order, and accepts ISO strings', () => {
    const result = computeMastery([
      { ...attempt({ outcome: 'correct' }), createdAt: '2026-10-04T10:05:00Z' },
      { ...attempt({ outcome: 'incorrect' }), createdAt: '2026-10-04T10:00:00Z' },
    ])
    expect(result.state).toBe('amber')
  })

  it('does not mutate its input', () => {
    const input = Object.freeze([attempt({}), attempt({ outcome: 'incorrect' })])
    expect(() => computeMastery(input)).not.toThrow()
  })
})

describe('summarizeMastery', () => {
  it('counts states', () => {
    expect(summarizeMastery(['red', 'green', 'green', 'gray'])).toEqual({ gray: 1, red: 1, amber: 0, green: 2 })
  })
})

describe('independentCorrectTypes', () => {
  it('lists types with an independent correct', () => {
    const types = independentCorrectTypes([diag('correct', 'guess'), attempt({ activityType: 'teach_back' }), attempt({ assisted: true })])
    expect([...types]).toEqual(['teach_back'])
  })
})
