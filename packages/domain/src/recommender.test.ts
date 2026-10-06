import { describe, expect, it } from 'vitest'
import { NextStepResponse } from '@lectheo/contracts'
import type { MasteryAttempt } from './mastery'
import {
  type ConceptSignal,
  type EvidenceMarker,
  type NextStepInput,
  conceptEvidence,
  conceptPayoff,
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
  const L3 = '0192f0a0-0000-7000-8000-000000000003'
  const C2 = '0192f0a0-0000-7000-8000-0000000000c2'
  const C3 = '0192f0a0-0000-7000-8000-0000000000c3'
  const C4 = '0192f0a0-0000-7000-8000-0000000000c4'
  const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * MIN)
  const attempt = (a: Partial<MasteryAttempt> & Pick<MasteryAttempt, 'activityType' | 'outcome'>): MasteryAttempt => ({
    confidence: null,
    assisted: false,
    isFollowUp: false,
    createdAt: at(60),
    ...a,
  })
  const lost: EvidenceMarker = { kind: 'lost', lectureId: L5, lectureTitle: 'Lecture 5', tMs: 761_000 }
  const important: EvidenceMarker = { kind: 'important', lectureId: L5, lectureTitle: 'Lecture 5', tMs: 65_000 }

  const ranked = rankConcepts(
    [
      signal({ conceptId: C1, conceptName: 'Pointers', state: 'red', confidentMistake: true }),
      signal({ conceptId: C2, conceptName: 'Arrays', state: 'amber' }),
      signal({ conceptId: C3, conceptName: 'Loops', state: 'gray' }),
      signal({ conceptId: C4, conceptName: 'Types', state: 'gray' }),
    ],
    NOW,
  )

  const base: NextStepInput = {
    processingLectures: [],
    unwatchedLibraryLectures: [],
    pendingDiagnostics: [],
    rankedConcepts: [],
    masteredConcepts: [],
    concepts: new Map(),
    activityTypes: new Map(),
    stumpEnabled: true,
    failedLectures: [],
    nextLectureSeq: null,
  }
  const valid = (step: unknown) => expect(NextStepResponse.safeParse(step).success).toBe(true)

  it('shows a processing lecture first, with no estimate or payoff', () => {
    const step = dashboardNextStep({
      ...base,
      processingLectures: [{ lectureId: L3, title: 'Week 3' }],
      unwatchedLibraryLectures: [{ lectureId: L5, title: 'Lecture 5' }],
      rankedConcepts: ranked,
    })
    expect(step).toEqual({
      kind: 'processing',
      lectureId: L3,
      reason: 'Week 3 is being processed.',
      evidence: [],
      estimateMinutes: null,
      payoff: null,
      alsoWorthDoing: [],
    })
    valid(step)
  })

  it('then an unwatched library lecture, estimated at its length', () => {
    const step = dashboardNextStep({
      ...base,
      unwatchedLibraryLectures: [{ lectureId: L5, title: 'Lecture 5', durationMs: 7_260_000 }],
      pendingDiagnostics: [{ lectureId: L4, title: 'Lecture 4' }],
      rankedConcepts: ranked,
    })
    expect(step).toEqual({
      kind: 'watch',
      lectureId: L5,
      reason: "Lecture 5 is ready. Watch it and tap when you're lost.",
      evidence: [],
      estimateMinutes: 121,
      payoff: 'Your marks decide what the diagnostic asks.',
      alsoWorthDoing: [],
    })
    valid(step)
    const unknownLength = dashboardNextStep({ ...base, unwatchedLibraryLectures: [{ lectureId: L5, title: 'L5' }] })
    expect(unknownLength.estimateMinutes).toBeNull()
  })

  it('then a pending diagnostic, with the lost mark before the important one', () => {
    const step = dashboardNextStep({
      ...base,
      pendingDiagnostics: [{ lectureId: L5, title: 'Lecture 5' }],
      pendingDiagnosticMarkers: [important, lost, { ...lost, tMs: 1000 }],
      rankedConcepts: ranked,
    })
    expect(step).toMatchObject({
      kind: 'diagnostic',
      lectureId: L5,
      estimateMinutes: 3,
      payoff: "Finds the mistakes you're sure about.",
      alsoWorthDoing: [],
    })
    expect(step.evidence).toEqual([
      { kind: 'marked_lost', text: "You marked I'm lost at 12:41 in Lecture 5", source: { lectureId: L5, tMs: 761_000 } },
      { kind: 'marked_important', text: 'You marked Important at 1:05 in Lecture 5', source: { lectureId: L5, tMs: 65_000 } },
    ])
    valid(step)
  })

  it('then the top concept with evidence, payoff and the next two concepts', () => {
    const sureWrong = (minutesAgo: number) =>
      attempt({ activityType: 'diagnostic', outcome: 'incorrect', confidence: 'sure', createdAt: at(minutesAgo) })
    const step = dashboardNextStep({
      ...base,
      rankedConcepts: ranked,
      activityTypes: new Map([
        [C1, 'teach_back'],
        [C2, 'spot_flaw'],
      ]),
      concepts: new Map([[C1, { attempts: [sureWrong(90), sureWrong(80)], markers: [lost] }]]),
    })
    expect(step).toMatchObject({
      kind: 'activity',
      conceptId: C1,
      conceptName: 'Pointers',
      activityType: 'teach_back',
      estimateMinutes: 5,
      payoff: 'A correct answer here clears the confident mistake.',
    })
    expect(step.reason).toContain('You were sure about Pointers')
    expect(step.evidence.map((e) => e.text)).toEqual([
      'Sure but wrong, twice, in the diagnostic',
      "You marked I'm lost at 12:41 in Lecture 5",
    ])
    expect(step.alsoWorthDoing).toEqual([
      { conceptId: C2, conceptName: 'Arrays', state: 'amber', confidentMistake: false, activityType: 'spot_flaw', reason: 'Arrays is getting there. One more independent win.' },
      // No precomputed type: falls back to nextActivityType on its attempts.
      { conceptId: C3, conceptName: 'Loops', state: 'gray', confidentMistake: false, activityType: 'spot_flaw', reason: 'Practice Loops.' },
    ])
    valid(step)
  })

  it('suggests Stump on the concept mastered longest ago when everything is green', () => {
    const win = (minutesAgo: number) => ({
      attempts: [attempt({ activityType: 'spot_flaw', outcome: 'correct', createdAt: at(minutesAgo) })],
      markers: [],
    })
    const concepts = new Map([
      [C1, win(10)],
      [C2, win(500)],
    ])
    const mastered = [
      { conceptId: C1, conceptName: 'Pointers' },
      { conceptId: C2, conceptName: 'Arrays' },
    ]
    const step = dashboardNextStep({ ...base, masteredConcepts: mastered, concepts })
    expect(step).toEqual({
      kind: 'activity',
      conceptId: C2,
      conceptName: 'Arrays',
      activityType: 'stump',
      reason: 'Everything here is Mastered. Try to stump the AI on Arrays.',
      evidence: [],
      estimateMinutes: 5,
      payoff: "The hardest test there is: write a question the AI can't answer.",
      alsoWorthDoing: [],
    })
    valid(step)
    const noStump = dashboardNextStep({ ...base, masteredConcepts: mastered, concepts, stumpEnabled: false })
    expect(noStump).toMatchObject({ activityType: 'spot_flaw', conceptId: C2, payoff: null })
  })

  it('then a failed lecture, then adding a lecture: never "all caught up"', () => {
    const failed = dashboardNextStep({ ...base, failedLectures: [{ lectureId: L3, title: 'Week 3' }], nextLectureSeq: 4 })
    expect(failed).toMatchObject({ kind: 'processing', lectureId: L3, reason: 'Processing Week 3 stopped. Open it to try again.' })

    const next = dashboardNextStep({ ...base, nextLectureSeq: 4 })
    expect(next).toEqual({ kind: 'add_lecture', reason: 'Add Lecture 4 to keep going.', evidence: [], estimateMinutes: null, payoff: null, alsoWorthDoing: [] })
    valid(next)
    expect(dashboardNextStep(base).reason).toBe('Add your next lecture to keep going.')
  })
})

describe('conceptEvidence', () => {
  const attempt = (a: Partial<MasteryAttempt> & Pick<MasteryAttempt, 'activityType' | 'outcome'>): MasteryAttempt => ({
    confidence: null,
    assisted: false,
    isFollowUp: false,
    createdAt: NOW,
    ...a,
  })
  const mark = (kind: EvidenceMarker['kind']): EvidenceMarker => ({ kind, lectureId: L4, lectureTitle: 'Lecture 4', tMs: 5000 })

  it('ranks confident mistake → latest wrong or partial → lost → important, max two', () => {
    const attempts = [
      attempt({ activityType: 'diagnostic', outcome: 'incorrect', confidence: 'sure', createdAt: new Date(NOW.getTime() - 2 * MIN) }),
      attempt({ activityType: 'spot_flaw', outcome: 'partial' }),
    ]
    const texts = conceptEvidence({ confidentMistake: true }, { attempts, markers: [mark('lost')] }).map((e) => e.text)
    expect(texts).toEqual(['Sure but wrong in the diagnostic', 'Partial in Spot the flaw'])
    const marks = conceptEvidence({ confidentMistake: false }, { attempts: [], markers: [mark('important'), mark('lost')] })
    expect(marks.map((e) => e.kind)).toEqual(['marked_lost', 'marked_important'])
  })

  it('does not repeat a sure-and-wrong latest answer as "Wrong"', () => {
    const sure = [attempt({ activityType: 'diagnostic', outcome: 'incorrect', confidence: 'sure' })]
    expect(conceptEvidence({ confidentMistake: true }, { attempts: sure, markers: [] }).map((e) => e.kind)).toEqual(['confident_mistake'])
    const unsure = [attempt({ activityType: 'diagnostic', outcome: 'incorrect', confidence: 'unsure' })]
    expect(conceptEvidence({ confidentMistake: false }, { attempts: unsure, markers: [] })[0]?.text).toBe('Wrong in the diagnostic')
  })
})

describe('conceptPayoff', () => {
  const none = { attempts: [], markers: [] }
  const sureWin: MasteryAttempt = { activityType: 'diagnostic', outcome: 'correct', confidence: 'sure', assisted: false, isFollowUp: false, createdAt: NOW }

  it('uses the §6.3 lines and stays silent when none is honest', () => {
    expect(conceptPayoff({ state: 'red', confidentMistake: true }, none)).toBe('A correct answer here clears the confident mistake.')
    expect(conceptPayoff({ state: 'red', confidentMistake: false }, none)).toBe('A correct answer moves it to Getting there.')
    expect(conceptPayoff({ state: 'amber', confidentMistake: false }, { attempts: [sureWin], markers: [] })).toBe(
      'One more independent win in a different activity → Mastered.',
    )
    expect(conceptPayoff({ state: 'amber', confidentMistake: false }, none)).toBeNull()
    expect(conceptPayoff({ state: 'gray', confidentMistake: false }, none)).toBeNull()
  })
})
