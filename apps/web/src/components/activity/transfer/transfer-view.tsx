'use client'

import type { ActivityResponse, SubmitResponse } from '@lectheo/contracts'
import { LoaderCircle } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { useShowExplanation } from '../spot-flaw/api'
import { parseMasteryState } from '../spot-flaw/logic'
import {
  type ExplanationData,
  GuidingQuestion,
  MasteryChange,
  RetryActions,
  RubricList,
  Sources,
  TryScore,
} from '../spot-flaw/result-panel'
import { ANSWER_MAX, useSubmitTransfer } from './api'

const failed = (title: string) => (error: unknown) =>
  toast.error(title, { description: errorMessage(error) })

/** Model solution, then why (paragraphs split on blank lines; transfer.ts explanationOf). */
function ModelSolution({ explanation }: { explanation: ExplanationData }) {
  return (
    <section aria-labelledby="solution-title" className="space-y-3">
      <h3 id="solution-title" className="font-medium">
        Model solution
      </h3>
      {explanation.explanation.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="leading-relaxed text-pretty">
          {p}
        </p>
      ))}
      <Sources sources={explanation.sources} />
    </section>
  )
}

/**
 * Transfer problem (F4b, F5): prompt → answer → score + guiding question → one retry (or "Show
 * me", assisted) → model solution + rubric. Submit responses and the explanation live in component
 * state because GET /activities/{id} doesn't return them.
 */
export function TransferView({ activity }: { activity: ActivityResponse }) {
  const id = activity.id
  const startState = parseMasteryState(useSearchParams().get('from'))
  const [answer, setAnswer] = useState('')
  const [results, setResults] = useState<SubmitResponse[]>([])
  const [explanation, setExplanation] = useState<ExplanationData | null>(null)
  const [retrying, setRetrying] = useState(false)
  const submit = useSubmitTransfer(id)
  const showMe = useShowExplanation(id)

  const closed = activity.status === 'closed'
  const lastResult = results.at(-1)
  const lastTry = activity.tries.at(-1)
  const finalResult = lastResult?.final ? lastResult : undefined
  const showForm =
    activity.status === 'active' || (activity.status === 'awaiting_retry' && retrying)
  const tryNo = activity.tries.length === 0 ? 1 : 2

  // Reopening a closed activity: the reveal isn't in the GET; after the final try "Show me"
  // changes nothing server-side.
  const needsReveal = closed && !finalResult && !explanation
  const { mutate: reveal, isIdle: revealIdle } = showMe
  useEffect(() => {
    if (needsReveal && revealIdle) reveal(undefined, { onSuccess: setExplanation })
  }, [needsReveal, revealIdle, reveal])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    submit.mutate(answer, {
      onSuccess: (res) => {
        setResults((prev) => [...prev, res])
        setRetrying(false)
      },
      onError: failed("Couldn't check your answer"),
    })
  }
  const onShowMe = () =>
    showMe.mutate(undefined, {
      onSuccess: setExplanation,
      onError: failed("Couldn't load the model solution"),
    })

  const shownExplanation =
    finalResult?.explanation !== undefined
      ? { explanation: finalResult.explanation, sources: finalResult.sources }
      : explanation

  return (
    <div className="space-y-8">
      <section aria-labelledby="problem-title" className="space-y-3">
        <div className="space-y-1">
          <h2 id="problem-title" className="font-serif text-xl font-medium">
            Apply it to a new problem
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Use what you learned in the lecture. Any correct approach counts.
          </p>
        </div>
        <p className="bg-card border-border rounded-xl border p-4 leading-relaxed text-pretty sm:p-5">
          {activity.prompt}
        </p>
      </section>

      <Separator />

      {showForm ? (
        <form onSubmit={onSubmit} className="space-y-3" aria-labelledby="answer-title">
          <label id="answer-title" htmlFor="transfer-answer" className="font-medium">
            {tryNo === 1 ? 'Your answer' : 'Your revised answer'}
          </label>
          <Textarea
            id="transfer-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={ANSWER_MAX}
            rows={8}
            placeholder="Explain your reasoning step by step."
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={!answer.trim() || submit.isPending}>
              {submit.isPending && (
                <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
              )}
              {submit.isPending ? 'Checking…' : 'Submit'}
            </Button>
            <span className="text-muted-foreground text-xs tabular-nums">
              {answer.length}/{ANSWER_MAX}
            </span>
          </div>
        </form>
      ) : (
        lastTry && (
          <section aria-label="Result" aria-live="polite" className="space-y-5">
            <TryScore tryNo={lastTry.tryNo} outcome={lastTry.outcome} result={lastResult} />
            {!closed && lastTry.feedback.guidingQuestion && (
              <GuidingQuestion question={lastTry.feedback.guidingQuestion} />
            )}
            {!closed && (
              <RetryActions
                onRetry={() => setRetrying(true)}
                onShowMe={onShowMe}
                showMePending={showMe.isPending}
                explanationShown={explanation !== null}
              />
            )}
          </section>
        )
      )}

      {shownExplanation && <ModelSolution explanation={shownExplanation} />}
      {!shownExplanation && lastResult && <Sources sources={lastResult.sources} />}
      {finalResult?.rubric && <RubricList rubric={finalResult.rubric} />}
      <MasteryChange start={startState} results={results.map((r) => r.mastery)} />
    </div>
  )
}
