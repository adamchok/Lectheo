import { describe, expect, it } from 'vitest'
import { NextStepResponse } from '@lectheo/contracts'
import type { MasteryAttempt } from './mastery'
import {
  type ConceptSignal,
  conceptPriority,
  dashboardNextStep,
  nextActivityType,
  prerequisitesOfRed,
  rankConcepts,
} from './recommender'

const NOW = new Date('2026-10-04T12:00:00Z')
const L4 = '0192f0a0-0000-7000-8000-000000000004'
const L5 = '0192f0a0-0000-7000-8000-000000000005'
const C1 = '0192f0a0-0000-7000-8000-0000000000c1'
const MIN = 60_000

function signal(overrides: Partial<ConceptSignal>): ConceptSignal {
  return {
    conceptId: 'c',
    conceptName: 'Concept',
    state: 'gray',
    confidentMistake: false,
    markedLost: false,
    prerequisiteOfRed: false,
    lastPracticedAt: null,
    ...overrides,
  }
}

function practice(activityType: MasteryAttempt['activityType'], assisted = false): MasteryAttempt {
  return { activityType, outcome: 'correct', confidence: null, assisted, isFollowUp: false, createdAt: NOW }
}

describe('conceptPriority', () => {
  it('applies the §6.3 weights', () => {
    expect(conceptPriority(signal({ state: 'red', confidentMistake: true, markedLost: true }), NOW)).toBe(200)
    expect(conceptPriority(signal({ state: 'amber', prerequisiteOfRed: true }), NOW)).toBe(35)
    expect(conceptPriority(signal({}), NOW)).toBe(0)
  })

  it('subtracts 15 when practiced in the last 10 minutes', () => {
    const recent = signal({ state: 'red', lastPracticedAt: new Date(NOW.getTime() - 5 * MIN) })
    const old = signal({ state: 'red', lastPracticedAt: new Date(NOW.getTime() - 11 * MIN) })
    expect(conceptPriority(recent, NOW)).toBe(45)
    expect(conceptPriority(old, NOW)).toBe(60)
  })
})

describe('rankConcepts', () => {
  it('orders confident mistakes → red → lost → amber → prerequisites, excluding green', () => {
    // Arrange
    const signals = [
      signal({ conceptId: 'prereq', state: 'gray', prerequisiteOfRed: true }),
      signal({ conceptId: 'amber', state: 'amber' }),
      signal({ conceptId: 'green', state: 'green' }),
      signal({ conceptId: 'lost', state: 'gray', markedLost: true }),
      signal({ conceptId: 'red', state: 'red' }),
      signal({ conceptId: 'cm', state: 'red', confidentMistake: true }),
    ]
    // Act
    const ranked = rankConcepts(signals, NOW)
    // Assert
    expect(ranked.map((r) => r.conceptId)).toEqual(['cm', 'red', 'lost', 'amber', 'prereq'])
  })

  it('keeps input order on ties', () => {
    const ranked = rankConcepts([signal({ conceptId: 'a' }), signal({ conceptId: 'b' })], NOW)
    expect(ranked.map((r) => r.conceptId)).toEqual(['a', 'b'])
  })
})

describe('prerequisitesOfRed', () => {
  it('returns the targets of depends_on edges from red concepts', () => {
    const edges = [
      { from: 'linked-list', to: 'pointer', relation: 'depends_on' as const },
      { from: 'linked-list', to: 'array', relation: 'contrasts_with' as const },
      { from: 'hash', to: 'array', relation: 'depends_on' as const },
    ]
    expect([...prerequisitesOfRed(edges, new Set(['linked-list']))]).toEqual(['pointer'])
  })
})

describe('nextActivityType', () => {
  it('starts with spot the flaw', () => {
    expect(nextActivityType([])).toBe('spot_flaw')
  })

  it('moves on once spot the flaw has an independent correct', () => {
    expect(nextActivityType([practice('spot_flaw')])).toBe('teach_back')
  })

  it('does not count assisted corrects', () => {
    expect(nextActivityType([practice('spot_flaw', true)])).toBe('spot_flaw')
  })

  it('offers transfer and stump only when enabled', () => {
    const done = [practice('spot_flaw'), practice('teach_back')]
    expect(nextActivityType(done)).toBe('spot_flaw')
    expect(nextActivityType(done, { transfer: true })).toBe('transfer')
    expect(nextActivityType([...done, practice('transfer')], { transfer: true, stump: true })).toBe('stump')
  })
})

describe('dashboardNextStep', () => {
  const ranked = rankConcepts([signal({ conceptId: C1, conceptName: 'Pointers', state: 'red', confidentMistake: true })], NOW)

  it('prefers an unwatched library lecture', () => {
    const step = dashboardNextStep({
      unwatchedLibraryLectures: [{ lectureId: L5, title: 'Lecture 5' }],
      pendingDiagnostics: [{ lectureId: L4, title: 'Lecture 4' }],
      rankedConcepts: ranked,
    })
    expect(step).toEqual({ kind: 'watch', lectureId: L5, reason: "Lecture 5 is ready. Watch it and tap when you're lost." })
    expect(NextStepResponse.safeParse(step).success).toBe(true)
  })

  it('then a pending diagnostic', () => {
    const step = dashboardNextStep({ unwatchedLibraryLectures: [], pendingDiagnostics: [{ lectureId: L4, title: 'Lecture 4' }], rankedConcepts: ranked })
    expect(step).toMatchObject({ kind: 'diagnostic', lectureId: L4 })
  })

  it('then the top concept with its activity type', () => {
    const step = dashboardNextStep({ unwatchedLibraryLectures: [], pendingDiagnostics: [], rankedConcepts: ranked, topConceptActivity: 'teach_back' })
    expect(step).toMatchObject({ kind: 'activity', conceptId: C1, conceptName: 'Pointers', activityType: 'teach_back' })
    expect(step.reason).toContain('You were sure about Pointers')
    expect(NextStepResponse.safeParse(step).success).toBe(true)
  })

  it('returns none when there is nothing to do', () => {
    const step = dashboardNextStep({ unwatchedLibraryLectures: [], pendingDiagnostics: [], rankedConcepts: [] })
    expect(step.kind).toBe('none')
  })
})
