import type { ConfidenceLevel, Finding } from '@lectheo/contracts'

/** F3.5: max adaptive follow-ups per diagnostic. */
export const MAX_FOLLOW_UPS = 2

export interface DiagnosticAnswer {
  readonly correct: boolean
  readonly confidence: ConfidenceLevel
  readonly isFollowUp: boolean
}

/**
 * Follow-up rule (F3.5, Architecture §4.4): a core (non-follow-up) answer that is sure + wrong
 * gets one follow-up on the same concept while fewer than `MAX_FOLLOW_UPS` were used.
 * Follow-ups never chain. The caller still needs an unseen verified item for the concept.
 */
export function shouldIssueFollowUp(answer: DiagnosticAnswer, followUpsUsed: number): boolean {
  return (
    !answer.isFollowUp &&
    !answer.correct &&
    answer.confidence === 'sure' &&
    followUpsUsed < MAX_FOLLOW_UPS
  )
}

/**
 * Immediate finding for one answer (API Spec §6 `finding`, F3.5):
 * - follow-up: wrong → `confident_mistake`, right → `possible_slip`
 * - core sure + wrong: follow-up issued → `possible_confident_mistake`; no follow-up left →
 *   `confident_mistake` (matches mastery's "sure+wrong with no follow-up")
 * - other wrong → `wrong`; right but not sure → `unsure_right`; sure + right → `right`
 */
export function classifyFinding(answer: DiagnosticAnswer, followUpIssued: boolean): Finding {
  if (answer.isFollowUp) return answer.correct ? 'possible_slip' : 'confident_mistake'
  if (answer.correct) return answer.confidence === 'sure' ? 'right' : 'unsure_right'
  if (answer.confidence !== 'sure') return 'wrong'
  return followUpIssued ? 'possible_confident_mistake' : 'confident_mistake'
}

/**
 * Results order (F3.6): confident mistakes → wrong → unsure-but-right → right.
 * Pending `possible_confident_mistake` sits with confident mistakes; a `possible_slip` (shown
 * softly) sits between wrong and unsure-right.
 */
export const FINDING_ORDER: readonly Finding[] = [
  'confident_mistake',
  'possible_confident_mistake',
  'wrong',
  'possible_slip',
  'unsure_right',
  'right',
]

const FINDING_RANK: ReadonlyMap<Finding, number> = new Map(FINDING_ORDER.map((f, i) => [f, i]))

/** Stable sort of result rows by `FINDING_ORDER` (F3.6). Returns a new array. */
export function orderFindings<T extends { readonly finding: Finding }>(rows: readonly T[]): T[] {
  return rows
    .map((row, order) => ({ row, order }))
    .sort(
      (a, b) =>
        (FINDING_RANK.get(a.row.finding) ?? 0) - (FINDING_RANK.get(b.row.finding) ?? 0) ||
        a.order - b.order,
    )
    .map(({ row }) => row)
}

export interface SessionResponse extends DiagnosticAnswer {
  readonly itemId: string
  readonly conceptId: string
}

export interface ResolvedFinding {
  readonly itemId: string
  readonly conceptId: string
  readonly confidence: ConfidenceLevel
  readonly finding: Finding
  /** The follow-up item that resolved this finding, if any. */
  readonly followUpItemId: string | null
}

/**
 * Final per-question findings for `GET /diagnostic/{sid}/results` (F3.5–F3.6). Each core answer
 * is resolved with its follow-up (the next follow-up on the same concept): sure+wrong then wrong
 * → `confident_mistake`, then right → `possible_slip`. Follow-ups are merged into their core row.
 * `responses` are answered rows in answer order; output is ordered by `FINDING_ORDER`.
 */
export function resolveSessionFindings(responses: readonly SessionResponse[]): ResolvedFinding[] {
  const used = new Set<number>()
  const rows: ResolvedFinding[] = []
  responses.forEach((r, i) => {
    if (r.isFollowUp) return
    const followIdx = isConfidentWrong(r)
      ? responses.findIndex((f, j) => j > i && f.isFollowUp && f.conceptId === r.conceptId && !used.has(j))
      : -1
    const followUp = followIdx >= 0 ? responses[followIdx] : undefined
    if (followUp) used.add(followIdx)
    const finding = followUp
      ? classifyFinding(followUp, false)
      : classifyFinding(r, false)
    rows.push({
      itemId: r.itemId,
      conceptId: r.conceptId,
      confidence: r.confidence,
      finding,
      followUpItemId: followUp?.itemId ?? null,
    })
  })
  return orderFindings(rows)
}

function isConfidentWrong(answer: DiagnosticAnswer): boolean {
  return !answer.correct && answer.confidence === 'sure'
}
