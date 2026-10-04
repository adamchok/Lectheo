import { describe, expect, it } from 'vitest'
import {
  FINDING_ORDER,
  MAX_FOLLOW_UPS,
  type SessionResponse,
  classifyFinding,
  orderFindings,
  resolveSessionFindings,
  shouldIssueFollowUp,
} from './diagnostic-findings'

const core = { isFollowUp: false } as const

describe('shouldIssueFollowUp (F3.5)', () => {
  it('issues a follow-up for sure + wrong while follow-ups remain', () => {
    expect(shouldIssueFollowUp({ ...core, correct: false, confidence: 'sure' }, 0)).toBe(true)
    expect(shouldIssueFollowUp({ ...core, correct: false, confidence: 'sure' }, MAX_FOLLOW_UPS - 1)).toBe(true)
  })

  it('stops after two follow-ups', () => {
    expect(shouldIssueFollowUp({ ...core, correct: false, confidence: 'sure' }, MAX_FOLLOW_UPS)).toBe(false)
  })

  it('does not issue for unsure wrong, right answers, or follow-ups', () => {
    expect(shouldIssueFollowUp({ ...core, correct: false, confidence: 'unsure' }, 0)).toBe(false)
    expect(shouldIssueFollowUp({ ...core, correct: true, confidence: 'sure' }, 0)).toBe(false)
    expect(shouldIssueFollowUp({ isFollowUp: true, correct: false, confidence: 'sure' }, 0)).toBe(false)
  })
})

describe('classifyFinding', () => {
  it.each([
    [{ ...core, correct: true, confidence: 'sure' as const }, false, 'right'],
    [{ ...core, correct: true, confidence: 'guess' as const }, false, 'unsure_right'],
    [{ ...core, correct: false, confidence: 'no_idea' as const }, false, 'wrong'],
    [{ ...core, correct: false, confidence: 'sure' as const }, true, 'possible_confident_mistake'],
    [{ ...core, correct: false, confidence: 'sure' as const }, false, 'confident_mistake'],
    [{ isFollowUp: true, correct: false, confidence: 'unsure' as const }, false, 'confident_mistake'],
    [{ isFollowUp: true, correct: true, confidence: 'sure' as const }, false, 'possible_slip'],
  ])('%j (follow-up issued: %s) → %s', (answer, issued, finding) => {
    expect(classifyFinding(answer, issued)).toBe(finding)
  })
})

describe('orderFindings (F3.6)', () => {
  it('orders confident mistakes → wrong → unsure-right → right, stable within a group', () => {
    const rows = [
      { id: 1, finding: 'right' as const },
      { id: 2, finding: 'wrong' as const },
      { id: 3, finding: 'unsure_right' as const },
      { id: 4, finding: 'confident_mistake' as const },
      { id: 5, finding: 'wrong' as const },
    ]
    expect(orderFindings(rows).map((r) => r.id)).toEqual([4, 2, 5, 3, 1])
    expect(FINDING_ORDER[0]).toBe('confident_mistake')
  })
})

describe('resolveSessionFindings', () => {
  it('merges follow-ups into their core question and orders the results', () => {
    // Arrange
    const responses: SessionResponse[] = [
      { itemId: 'i1', conceptId: 'arrays', correct: true, confidence: 'sure', isFollowUp: false },
      { itemId: 'i2', conceptId: 'pointers', correct: false, confidence: 'sure', isFollowUp: false },
      { itemId: 'f2', conceptId: 'pointers', correct: false, confidence: 'sure', isFollowUp: true },
      { itemId: 'i3', conceptId: 'malloc', correct: false, confidence: 'sure', isFollowUp: false },
      { itemId: 'f3', conceptId: 'malloc', correct: true, confidence: 'unsure', isFollowUp: true },
      { itemId: 'i4', conceptId: 'stack', correct: true, confidence: 'unsure', isFollowUp: false },
    ]
    // Act
    const results = resolveSessionFindings(responses)
    // Assert
    expect(results.map((r) => [r.itemId, r.finding, r.followUpItemId])).toEqual([
      ['i2', 'confident_mistake', 'f2'],
      ['i3', 'possible_slip', 'f3'],
      ['i4', 'unsure_right', null],
      ['i1', 'right', null],
    ])
  })
})
