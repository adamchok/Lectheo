import type {
  ActivityType,
  AlsoWorthDoing,
  AttemptActivityType,
  MarkerKind,
  MasteryState,
  NextStepEvidence,
  NextStepResponse,
  Relation,
} from '@lectheo/contracts'
import { ACTIVITY_LABELS } from './activity-labels'
import { type MasteryAttempt, independentCorrectTypes } from './mastery'
import { type Timestamp, formatTimestamp, toEpochMs } from './time'

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
  /** "Lecture 5" for library lectures, the student's own title otherwise. */
  readonly title: string
  readonly durationMs?: number | null
}

/** One of the student's own marks, as evidence. */
export interface EvidenceMarker {
  readonly kind: MarkerKind
  readonly lectureId: string
  /** Same convention as `LectureRef.title`. */
  readonly lectureTitle: string
  readonly tMs: number
}

export interface ConceptDetail {
  /** This student's graded attempts on the concept (any order). */
  readonly attempts: readonly MasteryAttempt[]
  /** This student's marks linked to the concept, newest first. */
  readonly markers: readonly EvidenceMarker[]
}

export interface NextStepInput {
  /** The student's lectures in the pipeline (processing or map_ready), in course order. */
  readonly processingLectures: readonly LectureRef[]
  /** Library lectures the user hasn't watched yet, in course order (sample accounts only). */
  readonly unwatchedLibraryLectures: readonly LectureRef[]
  /** Watched / processed lectures with no completed diagnostic, in course order. */
  readonly pendingDiagnostics: readonly LectureRef[]
  /** The student's marks on the first pending-diagnostic lecture, newest first. */
  readonly pendingDiagnosticMarkers?: readonly EvidenceMarker[]
  /** Output of `rankConcepts`. */
  readonly rankedConcepts: readonly RankedConcept[]
  /** Mastered concepts, in map order (the Stump fallback, F0.12). */
  readonly masteredConcepts: readonly { conceptId: string; conceptName: string }[]
  /** Attempts and marks per concept id. Missing means none. */
  readonly concepts: ReadonlyMap<string, ConceptDetail>
  /** Next activity per concept id (from `nextActivityType`), at least for ranked 1–3. */
  readonly activityTypes: ReadonlyMap<string, ActivityType>
  readonly stumpEnabled: boolean
  /** The student's lectures whose processing failed, in course order. */
  readonly failedLectures: readonly LectureRef[]
  /** The student's lectures still being added (draft or uploading), in course order. */
  readonly unfinishedLectures: readonly LectureRef[]
  /** Seq for "Add Lecture N", or null when the course doesn't number lectures (library). */
  readonly nextLectureSeq: number | null
}

/** Card estimates (Architecture §6.3): fixed, honest values until real timings exist. */
export const ESTIMATE_MINUTES = { diagnostic: 3, practice: 5 } as const

/** Card payoff lines, exact wording from Architecture §6.3. */
export const PAYOFFS = {
  confidentMistake: 'A correct answer here clears the confident mistake.',
  red: 'A correct answer moves it to Getting there.',
  oneMoreWin: 'One more independent win in a different activity → Mastered.',
  watch: 'Your marks decide what the diagnostic asks.',
  diagnostic: "Finds the mistakes you're sure about.",
  stump: "The hardest test there is: write a question the AI can't answer.",
} as const

const MAX_EVIDENCE = 2
const MAX_ALSO_WORTH_DOING = 2

const EMPTY: ConceptDetail = { attempts: [], markers: [] }

/** Fresh arrays each call: responses never share mutable state. */
const noExtras = () => ({
  evidence: [],
  estimateMinutes: null,
  payoff: null,
  alsoWorthDoing: [],
})

/**
 * Dashboard "Next step" card (F0.4, F0.9–F0.12, Architecture §6.3): processing lecture →
 * unwatched library lecture → pending diagnostic → top concept → Stump on the concept mastered
 * longest ago → failed lecture → unfinished (draft) lecture → add a lecture. Never a dead end.
 */
export function dashboardNextStep(input: NextStepInput): NextStepResponse {
  const processing = input.processingLectures[0]
  if (processing) {
    return lectureStep('processing', processing, `${processing.title} is being processed.`, null)
  }
  const lecture = input.unwatchedLibraryLectures[0]
  if (lecture) {
    return {
      ...lectureStep(
        'watch',
        lecture,
        `${lecture.title} is ready. Watch it and tap when you're lost.`,
        PAYOFFS.watch,
      ),
      estimateMinutes: durationMinutes(lecture.durationMs),
    }
  }
  const pending = input.pendingDiagnostics[0]
  if (pending) {
    return {
      ...lectureStep(
        'diagnostic',
        pending,
        `Check what stuck from ${pending.title} with a quick diagnostic.`,
        PAYOFFS.diagnostic,
      ),
      evidence: markerEvidence(input.pendingDiagnosticMarkers ?? []),
      estimateMinutes: ESTIMATE_MINUTES.diagnostic,
    }
  }
  const [top, ...rest] = input.rankedConcepts
  if (top) return conceptStep(input, top, rest)
  const stale = masteredLongestAgo(input)
  if (stale) return stumpStep(input, stale)
  const failed = input.failedLectures[0]
  if (failed) {
    return lectureStep(
      'processing',
      failed,
      `Processing ${failed.title} stopped. Open it to try again.`,
      null,
    )
  }
  const unfinished = input.unfinishedLectures[0]
  if (unfinished) {
    return lectureStep('processing', unfinished, `Finish adding ${unfinished.title}.`, null)
  }
  return {
    ...noExtras(),
    kind: 'add_lecture',
    reason:
      input.nextLectureSeq === null
        ? 'Add your next lecture to keep going.'
        : `Add Lecture ${input.nextLectureSeq} to keep going.`,
  }
}

function lectureStep(
  kind: NextStepResponse['kind'],
  lecture: LectureRef,
  reason: string,
  payoff: string | null,
): NextStepResponse {
  return { ...noExtras(), kind, lectureId: lecture.lectureId, reason, payoff }
}

function conceptStep(
  input: NextStepInput,
  top: RankedConcept,
  rest: readonly RankedConcept[],
): NextStepResponse {
  const detail = input.concepts.get(top.conceptId) ?? EMPTY
  return {
    kind: 'activity',
    conceptId: top.conceptId,
    conceptName: top.conceptName,
    activityType: activityFor(input, top.conceptId),
    reason: conceptReason(top),
    evidence: conceptEvidence(top, detail),
    estimateMinutes: ESTIMATE_MINUTES.practice,
    payoff: conceptPayoff(top, detail),
    alsoWorthDoing: rest.slice(0, MAX_ALSO_WORTH_DOING).map(
      (c): AlsoWorthDoing => ({
        conceptId: c.conceptId,
        conceptName: c.conceptName,
        state: c.state,
        confidentMistake: c.confidentMistake,
        activityType: activityFor(input, c.conceptId),
        reason: conceptReason(c),
      }),
    ),
  }
}

/** Every concept is Mastered (F0.12): Stump the AI, else keep it fresh with Spot the flaw. */
function stumpStep(
  input: NextStepInput,
  concept: { conceptId: string; conceptName: string },
): NextStepResponse {
  const activityType: ActivityType = input.stumpEnabled ? 'stump' : 'spot_flaw'
  return {
    ...noExtras(),
    kind: 'activity',
    conceptId: concept.conceptId,
    conceptName: concept.conceptName,
    activityType,
    reason: input.stumpEnabled
      ? `Everything here is Mastered. Try to stump the AI on ${concept.conceptName}.`
      : `Everything here is Mastered. Keep ${concept.conceptName} fresh with ${ACTIVITY_LABELS[activityType]}.`,
    estimateMinutes: ESTIMATE_MINUTES.practice,
    payoff: input.stumpEnabled ? PAYOFFS.stump : null,
  }
}

/** Whole minutes, at least 1; null when the length is unknown. */
const durationMinutes = (ms: number | null | undefined): number | null =>
  ms ? Math.max(1, Math.round(ms / 60_000)) : null

function activityFor(input: NextStepInput, conceptId: string): ActivityType {
  return (
    input.activityTypes.get(conceptId) ??
    nextActivityType((input.concepts.get(conceptId) ?? EMPTY).attempts)
  )
}

const latestAt = (attempts: readonly MasteryAttempt[]): number =>
  Math.max(Number.NEGATIVE_INFINITY, ...attempts.map((a) => toEpochMs(a.createdAt)))

/**
 * The mastered concept practiced longest ago (F0.12).
 * ponytail: "mastered longest ago" ≈ the oldest latest attempt; replay attempts to find the exact
 * moment it turned green if that ever reads wrong.
 */
function masteredLongestAgo(input: NextStepInput) {
  return input.masteredConcepts
    .map((c, order) => ({ c, at: latestAt(input.concepts.get(c.conceptId)?.attempts ?? []), order }))
    .sort((a, b) => a.at - b.at || a.order - b.order)[0]?.c
}

const OUTCOME_LABELS: Readonly<Record<AttemptActivityType, string>> = {
  ...ACTIVITY_LABELS,
  diagnostic: 'the diagnostic',
}

const MARKER_WORDS: Readonly<Record<MarkerKind, string>> = {
  lost: "I'm lost",
  important: 'Important',
}

function sureWrongText(count: number): string {
  if (count === 1) return 'Sure but wrong in the diagnostic'
  if (count === 2) return 'Sure but wrong, twice, in the diagnostic'
  return `Sure but wrong ${count} times in the diagnostic`
}

const isSureWrong = (a: MasteryAttempt): boolean =>
  a.activityType === 'diagnostic' && a.confidence === 'sure' && a.outcome === 'incorrect'

/** "You marked I'm lost at 12:41 in Lecture 5", with its lecture moment. */
function markEvidence(m: EvidenceMarker): NextStepEvidence {
  return {
    kind: m.kind === 'lost' ? 'marked_lost' : 'marked_important',
    text: `You marked ${MARKER_WORDS[m.kind]} at ${formatTimestamp(m.tMs)} in ${m.lectureTitle}`,
    source: { lectureId: m.lectureId, tMs: m.tMs },
  }
}

/** The newest lost mark, then the newest important mark. */
function markerEvidence(markers: readonly EvidenceMarker[]): NextStepEvidence[] {
  return (['lost', 'important'] as const)
    .map((kind) => markers.find((m) => m.kind === kind))
    .filter((m): m is EvidenceMarker => m !== undefined)
    .map(markEvidence)
}

/**
 * Up to two "Why" lines, strongest first (Architecture §6.3): confident mistake → wrong or
 * partial in the latest attempt → a lost mark → an important mark.
 */
export function conceptEvidence(
  concept: Pick<RankedConcept, 'confidentMistake'>,
  detail: ConceptDetail,
): NextStepEvidence[] {
  const out: NextStepEvidence[] = []
  const sureWrong = detail.attempts.filter(isSureWrong).length
  if (concept.confidentMistake && sureWrong > 0) {
    out.push({ kind: 'confident_mistake', text: sureWrongText(sureWrong) })
  }
  const latest = [...detail.attempts].sort(
    (a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt),
  )[0]
  // The confident-mistake line already covers a latest answer that was sure and wrong.
  const covered = out.length > 0 && latest !== undefined && isSureWrong(latest)
  if (latest && !covered && (latest.outcome === 'incorrect' || latest.outcome === 'partial')) {
    const wrong = latest.outcome === 'incorrect'
    out.push({
      kind: wrong ? 'wrong' : 'partial',
      text: `${wrong ? 'Wrong' : 'Partial'} in ${OUTCOME_LABELS[latest.activityType]}`,
    })
  }
  return [...out, ...markerEvidence(detail.markers)].slice(0, MAX_EVIDENCE)
}

/** What finishing the step changes (Architecture §6.3), or null when there's no honest line. */
export function conceptPayoff(
  concept: Pick<RankedConcept, 'state' | 'confidentMistake'>,
  detail: ConceptDetail,
): string | null {
  if (concept.confidentMistake) return PAYOFFS.confidentMistake
  if (concept.state === 'red') return PAYOFFS.red
  if (concept.state === 'amber' && independentCorrectTypes(detail.attempts).size === 1) {
    return PAYOFFS.oneMoreWin
  }
  return null
}

function conceptReason(top: RankedConcept): string {
  if (top.confidentMistake) {
    return `You were sure about ${top.conceptName}, but got it wrong. Let's fix that.`
  }
  if (top.state === 'red') return `${top.conceptName} needs work.`
  if (top.state === 'amber') return `${top.conceptName} is getting there. One more independent win.`
  return `Practice ${top.conceptName}.`
}
