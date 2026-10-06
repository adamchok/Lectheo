import { describe, expect, it } from 'vitest'
import {
  EMPTY_ANSWER,
  masteryTrail,
  parseMasteryState,
  pickSentence,
  pickVerdict,
  scoreRows,
  submitBlocker,
  submitBody,
} from './logic'

describe('spot-flaw answer logic', () => {
  it('clicking a sentence sets Flawed + location; Correct clears the location', () => {
    const picked = pickSentence(EMPTY_ANSWER, 2)
    expect(picked).toMatchObject({ verdict: 'flawed', flawSentenceIdx: 2 })
    expect(pickVerdict(picked, 'correct')).toMatchObject({
      verdict: 'correct',
      flawSentenceIdx: null,
    })
    expect(pickVerdict(picked, 'flawed').flawSentenceIdx).toBe(2)
  })

  it('blocks submit until the answer is complete', () => {
    expect(submitBlocker(EMPTY_ANSWER)).toMatch(/Flawed or No flaw/)
    expect(submitBlocker(pickVerdict(EMPTY_ANSWER, 'correct'))).toBeNull()
    expect(submitBlocker(pickVerdict(EMPTY_ANSWER, 'flawed'))).toMatch(/sentence/)
    const located = pickSentence(EMPTY_ANSWER, 0)
    expect(submitBlocker({ ...located, correction: '   ' })).toMatch(/should say/)
    expect(submitBlocker({ ...located, correction: 'It is O(n).' })).toBeNull()
  })

  it('builds the API body: no correction or location with a Correct verdict', () => {
    const flawed = { ...pickSentence(EMPTY_ANSWER, 1), correction: '  fixed  ' }
    expect(submitBody(flawed)).toEqual({
      verdict: 'flawed',
      flawSentenceIdx: 1,
      correction: 'fixed',
    })
    expect(submitBody({ ...flawed, verdict: 'correct' })).toEqual({ verdict: 'correct' })
  })

  it('score rows: code checks first, then judged criteria; no location row for no-flaw', () => {
    const rows = scoreRows({
      checks: { verdict: true, location: false },
      criteria: [{ id: 'correction', label: 'Fix', score: 1, max: 2 }],
    })
    expect(rows.map((r) => [r.id, r.ok, r.detail])).toEqual([
      ['verdict', true, '2/2'],
      ['location', false, '0/2'],
      ['correction', false, '1/2'],
    ])
    expect(scoreRows({ checks: { verdict: true, location: null }, criteria: [] })).toHaveLength(1)
  })

  it('mastery trail merges repeats and skips an unknown start', () => {
    expect(masteryTrail('red', ['amber', 'amber', 'green'])).toEqual(['red', 'amber', 'green'])
    expect(masteryTrail(null, ['amber'])).toEqual(['amber'])
    expect(masteryTrail('amber', ['amber'])).toEqual(['amber'])
    expect(parseMasteryState('green')).toBe('green')
    expect(parseMasteryState('purple')).toBeNull()
  })
})
