import { describe, expect, it } from 'vitest'
import {
  checkSpotFlaw,
  rubricOutcome,
  scoreSpotFlaw,
  spotFlawBand,
  stumpOutcome,
  teachBackOutcome,
} from './scoring'

const FLAWED = { hasFlaw: true, flawSentenceIdx: 2 }
const CLEAN = { hasFlaw: false, flawSentenceIdx: null }

describe('spot the flaw scoring (F4c.6)', () => {
  it('flawed scenario: right verdict + location + full correction = 6/6 correct', () => {
    // Arrange
    const checks = checkSpotFlaw(FLAWED, { verdict: 'flawed', flawSentenceIdx: 2 })
    // Act
    const result = scoreSpotFlaw(checks, 2)
    // Assert
    expect(checks).toMatchObject({ verdictCorrect: true, locationCorrect: true, needsJudge: true, codeScore: 4 })
    expect(result).toEqual({ score: 6, maxScore: 6, outcome: 'correct' })
  })

  it('5/6 is still correct', () => {
    expect(scoreSpotFlaw(checkSpotFlaw(FLAWED, { verdict: 'flawed', flawSentenceIdx: 2 }), 1).outcome).toBe('correct')
  })

  it('wrong location with a good correction is partial (4/6)', () => {
    const checks = checkSpotFlaw(FLAWED, { verdict: 'flawed', flawSentenceIdx: 0 })
    expect(checks.locationCorrect).toBe(false)
    expect(scoreSpotFlaw(checks, 2)).toEqual({ score: 4, maxScore: 6, outcome: 'partial' })
  })

  it('verdict only (2/6) is incorrect', () => {
    const checks = checkSpotFlaw(FLAWED, { verdict: 'flawed', flawSentenceIdx: 1 })
    expect(scoreSpotFlaw(checks, 0)).toEqual({ score: 2, maxScore: 6, outcome: 'incorrect' })
  })

  it('wrong verdict skips the judge and scores 0', () => {
    const checks = checkSpotFlaw(FLAWED, { verdict: 'correct' })
    expect(checks).toMatchObject({ verdictCorrect: false, locationCorrect: false, needsJudge: false })
    expect(scoreSpotFlaw(checks)).toEqual({ score: 0, maxScore: 6, outcome: 'incorrect' })
  })

  it('correct scenario: 2/2 correct, 0/2 incorrect, no judge', () => {
    const right = checkSpotFlaw(CLEAN, { verdict: 'correct' })
    const wrong = checkSpotFlaw(CLEAN, { verdict: 'flawed', flawSentenceIdx: 1 })
    expect(right).toMatchObject({ needsJudge: false, locationCorrect: null })
    expect(scoreSpotFlaw(right)).toEqual({ score: 2, maxScore: 2, outcome: 'correct' })
    expect(scoreSpotFlaw(wrong)).toEqual({ score: 0, maxScore: 2, outcome: 'incorrect' })
  })

  it('rejects a missing or out-of-range judge score when the judge is needed', () => {
    const checks = checkSpotFlaw(FLAWED, { verdict: 'flawed', flawSentenceIdx: 2 })
    expect(() => scoreSpotFlaw(checks)).toThrow(RangeError)
    expect(() => scoreSpotFlaw(checks, 3)).toThrow(RangeError)
  })

  it.each([
    [6, 'correct'],
    [5, 'correct'],
    [4, 'partial'],
    [3, 'partial'],
    [2, 'incorrect'],
    [0, 'incorrect'],
  ])('band %d/6 → %s', (score, outcome) => {
    expect(spotFlawBand(score)).toBe(outcome)
  })
})

describe('rubricOutcome / teachBackOutcome', () => {
  it.each([
    [[2, 2, 2], 'correct'],
    [[2, 2, 1], 'correct'],
    [[2, 1, 1], 'partial'],
    [[1, 1, 1], 'partial'],
    [[1, 1, 0], 'incorrect'],
  ])('key-point scores %j → %s', (scores, outcome) => {
    const result = teachBackOutcome(scores.map((score) => ({ score, max: 2 })))
    expect(result.outcome).toBe(outcome)
    expect(result.maxScore).toBe(6)
  })

  it('clamps out-of-range criterion scores', () => {
    expect(rubricOutcome([{ score: 5, max: 2 }, { score: -1, max: 2 }])).toEqual({ score: 2, maxScore: 4, outcome: 'partial' })
  })

  it('is incorrect with no criteria', () => {
    expect(rubricOutcome([])).toEqual({ score: 0, maxScore: 0, outcome: 'incorrect' })
  })
})

describe('stumpOutcome (F4d)', () => {
  it('rejected questions are invalid and do not count', () => {
    expect(stumpOutcome({ valid: false, aiStumped: false })).toMatchObject({ outcome: 'invalid', countsForMastery: false })
  })

  it('accepted questions count as correct, with or without stumping the AI', () => {
    expect(stumpOutcome({ valid: true, aiStumped: false })).toEqual({ outcome: 'correct', label: 'Accepted', countsForMastery: true })
    expect(stumpOutcome({ valid: true, aiStumped: true }).label).toBe('Accepted · you stumped the AI')
  })
})
