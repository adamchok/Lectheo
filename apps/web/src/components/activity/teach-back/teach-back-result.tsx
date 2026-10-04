'use client'

import type { MasterySummary, Outcome, SubmitResponse } from '@lectheo/contracts'
import { ArrowRight, Lightbulb, MessageCircleQuestion } from 'lucide-react'
import Link from 'next/link'
import { MasteryBadge } from '@/components/mastery-badge'
import { MASTERY_META } from '@/components/mastery-meta'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Criterion = SubmitResponse['criteria'][number]

function coverageOf(c: Pick<Criterion, 'score' | 'max'>) {
  if (c.score >= c.max) return { label: 'Covered', meta: MASTERY_META.green }
  if (c.score > 0) return { label: 'Partly covered', meta: MASTERY_META.amber }
  return { label: 'Missing', meta: MASTERY_META.red }
}

function Coverage({ criterion }: { criterion: Pick<Criterion, 'score' | 'max'> }) {
  const { label, meta } = coverageOf(criterion)
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        meta.badgeClass,
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {label}
    </span>
  )
}

function Sources({ sources }: { sources: SubmitResponse['sources'] }) {
  if (sources.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
        From the lecture
      </p>
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

/** Try 1 (not final): per-key-point coverage, guiding question, then the hint (F5.1). */
export function TryFeedback({ result }: { result: SubmitResponse }) {
  const { guidingQuestion, hint } = result.feedback
  return (
    <section
      aria-labelledby="try-feedback-title"
      className="bg-card border-border space-y-5 rounded-2xl border p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="try-feedback-title" className="font-serif text-xl font-medium">
          How your explanation landed
        </h2>
        <p className="text-muted-foreground text-sm">
          {result.score} of {result.maxScore} points. You get one more try.
        </p>
      </div>
      <ul className="divide-border divide-y">
        {result.criteria.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{c.label}</span>
            <Coverage criterion={c} />
          </li>
        ))}
      </ul>
      {guidingQuestion && (
        <p className="bg-accent flex gap-2.5 rounded-xl p-4 text-[0.9375rem] leading-relaxed">
          <MessageCircleQuestion aria-hidden className="text-primary mt-0.5 size-5 shrink-0" />
          <span>{guidingQuestion}</span>
        </p>
      )}
      {hint && (
        <p className="text-muted-foreground flex gap-2.5 text-sm leading-relaxed">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{hint}</span>
        </p>
      )}
      <Sources sources={result.sources} />
      <p className="text-sm font-medium">Keep explaining to Sam below, then submit again.</p>
    </section>
  )
}

const HEADLINES: Readonly<Record<Outcome, string>> = {
  correct: 'You taught it!',
  partial: 'Getting there',
  incorrect: 'Not quite yet',
  invalid: 'Not graded',
}

/** Final try: key points revealed with coverage, the lecture summary, sources, mastery change. */
export function FinalReveal({
  result,
  before,
}: {
  result: SubmitResponse
  /** Mastery after try 1, when known, to show the change. */
  before?: MasterySummary
}) {
  const coverage = new Map(result.criteria.map((c) => [c.id, c]))
  // ponytail: explanation = "summary\n\nKey points…" (teach-back.ts); the points render below.
  const summary = result.explanation?.split('\n\n')[0]
  const changed = before && before.state !== result.mastery.state
  return (
    <section
      aria-labelledby="final-title"
      className="bg-card border-border space-y-6 rounded-2xl border p-5 sm:p-6"
    >
      <div className="space-y-1">
        <h2 id="final-title" className="font-serif text-2xl font-medium">
          {HEADLINES[result.outcome]}
        </h2>
        <p className="text-muted-foreground text-sm">
          {result.score} of {result.maxScore} points on the key points from the lecture.
        </p>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Key points</h3>
        <ol className="space-y-3">
          {(result.rubric ?? []).map((r, i) => {
            const c = coverage.get(r.id)
            return (
              <li key={r.id} className="flex items-start justify-between gap-3 text-[0.9375rem]">
                <span className="leading-relaxed">
                  <span className="text-muted-foreground mr-2 tabular-nums">{i + 1}.</span>
                  {r.description}
                </span>
                {c && <Coverage criterion={c} />}
              </li>
            )
          })}
        </ol>
      </div>

      {summary && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">In the lecture</h3>
          <p className="text-muted-foreground text-[0.9375rem] leading-relaxed">{summary}</p>
        </div>
      )}
      <Sources sources={result.sources} />

      <div className="border-border flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mastery</span>
          {changed && (
            <>
              <MasteryBadge state={before.state} size="sm" />
              <ArrowRight aria-label="now" className="text-muted-foreground size-4" />
            </>
          )}
          <MasteryBadge
            state={result.mastery.state}
            reasons={result.mastery.reasons}
            confidentMistake={result.mastery.confidentMistake}
          />
        </div>
        <Button asChild>
          <Link href="/dashboard">
            Back to dashboard
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </div>
    </section>
  )
}
