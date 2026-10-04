'use client'

import type {
  SourceRef as SourceRefData,
  MasteryState,
  MasterySummary,
  Outcome,
  SubmitResponse,
} from '@lectheo/contracts'
import {
  ArrowRight,
  Check,
  Eye,
  LoaderCircle,
  MessageCircleQuestion,
  RotateCcw,
  X,
} from 'lucide-react'
import { Fragment } from 'react'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { masteryTrail, OUTCOME_LABELS, scoreRows } from './logic'

/** POST …/explanation body, or the explanation part of a final submit. */
export interface ExplanationData {
  explanation: string
  sources: readonly SourceRefData[]
}

const OUTCOME_CLASS: Readonly<Record<Outcome, string>> = {
  correct: 'bg-mastery-green-bg text-mastery-green',
  partial: 'bg-mastery-amber-bg text-mastery-amber',
  incorrect: 'bg-mastery-red-bg text-mastery-red',
  invalid: 'bg-mastery-gray-bg text-mastery-gray',
}

export interface TryScoreProps {
  tryNo: number
  outcome: Outcome
  /** Full submit response when this session made the try (detail rows need it). */
  result?: SubmitResponse
}

/** Outcome + score of one try, then verdict / sentence / correction rows. */
export function TryScore({ tryNo, outcome, result }: TryScoreProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn('rounded-full px-2.5 py-1 text-sm font-medium', OUTCOME_CLASS[outcome])}
        >
          {OUTCOME_LABELS[outcome]}
        </span>
        {result && (
          <span className="font-mono text-sm tabular-nums">
            {result.score}/{result.maxScore}
          </span>
        )}
        <span className="text-muted-foreground text-sm">Try {tryNo} of 2</span>
      </div>
      {result && (
        <ul className="divide-border border-border divide-y rounded-lg border text-sm">
          {scoreRows(result).map((row) => (
            <li key={row.id} className="flex items-center gap-2 px-3 py-2">
              {row.ok ? (
                <Check aria-label="Right" className="text-mastery-green size-4 shrink-0" />
              ) : (
                <X aria-label="Not right" className="text-mastery-red size-4 shrink-0" />
              )}
              <span className="flex-1">{row.label}</span>
              <span className="text-muted-foreground font-mono tabular-nums">{row.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function GuidingQuestion({ question }: { question: string }) {
  return (
    <div className="border-primary/30 bg-primary/5 flex gap-3 rounded-lg border p-4">
      <MessageCircleQuestion aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
      <div className="space-y-1">
        <p className="text-primary text-xs font-semibold tracking-[0.08em] uppercase">
          Think about this
        </p>
        <p className="leading-relaxed text-pretty">{question}</p>
      </div>
    </div>
  )
}

export function Sources({ sources }: { sources: readonly SourceRefData[] }) {
  if (sources.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium">From the lecture</p>
      <ul className="space-y-0.5">
        {sources.map((s) => (
          <li key={`${s.lectureId}-${s.idx}`}>
            <SourceRef source={s} />
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Explanation({ explanation }: { explanation: ExplanationData }) {
  return (
    <section aria-labelledby="explanation-title" className="space-y-3">
      <h3 id="explanation-title" className="font-medium">
        Explanation
      </h3>
      <p className="leading-relaxed text-pretty">{explanation.explanation}</p>
      <Sources sources={explanation.sources} />
    </section>
  )
}

export interface RetryActionsProps {
  onRetry: () => void
  onShowMe: () => void
  showMePending: boolean
  explanationShown: boolean
}

/** After try 1: Retry, or "Show me" (F5.1: reveals the explanation, marks the retry assisted). */
export function RetryActions({
  onRetry,
  onShowMe,
  showMePending,
  explanationShown,
}: RetryActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="lg" onClick={onRetry}>
        <RotateCcw aria-hidden />
        Retry
      </Button>
      {!explanationShown && (
        <Button variant="ghost" onClick={onShowMe} disabled={showMePending}>
          {showMePending ? (
            <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
          ) : (
            <Eye aria-hidden />
          )}
          Show me
        </Button>
      )}
      <p className="text-muted-foreground w-full text-xs">
        {explanationShown
          ? 'You saw the explanation, so your retry counts as assisted.'
          : '“Show me” reveals the explanation and marks your retry as assisted.'}
      </p>
    </div>
  )
}

export function RubricList({ rubric }: { rubric: NonNullable<SubmitResponse['rubric']> }) {
  return (
    <section aria-labelledby="rubric-title" className="space-y-2">
      <h3 id="rubric-title" className="font-medium">
        How it was graded
      </h3>
      <dl className="space-y-2 text-sm">
        {rubric.map((r) => (
          <div key={r.id}>
            <dt className="font-medium">{r.label}</dt>
            <dd className="text-muted-foreground text-pretty">{r.description}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export interface MasteryChangeProps {
  /** State before the activity, when the entry point passed it (?from=). */
  start: MasteryState | null
  results: readonly MasterySummary[]
}

/** Mastery before → after (F6), each step an icon + label badge; reasons for the latest. */
export function MasteryChange({ start, results }: MasteryChangeProps) {
  const latest = results.at(-1)
  if (!latest) return null
  const trail = masteryTrail(
    start,
    results.map((m) => m.state),
  )
  return (
    <section aria-labelledby="mastery-title" className="space-y-2">
      <h3 id="mastery-title" className="font-medium">
        Your mastery of this concept
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        {trail.map((state, i) => (
          <Fragment key={`${state}-${i}`}>
            {i > 0 && <ArrowRight aria-label="then" className="text-muted-foreground size-4" />}
            <MasteryBadge
              state={state}
              reasons={i === trail.length - 1 ? latest.reasons : undefined}
              confidentMistake={i === trail.length - 1 ? latest.confidentMistake : undefined}
            />
          </Fragment>
        ))}
      </div>
      {latest.reasons && latest.reasons.length > 0 && (
        <ul className="text-muted-foreground list-inside list-disc text-sm">
          {latest.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
