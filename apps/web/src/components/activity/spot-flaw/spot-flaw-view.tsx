'use client'

import type { ActivityResponse, HintResponse, SubmitResponse } from '@lectheo/contracts'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Separator } from '@/components/ui/separator'
import { InlineError } from '../shared'
import { useAskAuthor, useShowExplanation, useSubmitAnswer, useTakeHint } from './api'
import { AnswerForm } from './answer-form'
import { AuthorChat } from './author-chat'
import { HintLadder } from './hint-ladder'
import { EMPTY_ANSWER, parseMasteryState, pickSentence, type Answer } from './logic'
import {
  Explanation,
  type ExplanationData,
  GuidingQuestion,
  MapLink,
  MasteryChange,
  RetryActions,
  RubricList,
  Sources,
  TryScore,
} from './result-panel'
import { ScenarioList } from './scenario-list'

// ponytail: GET /activities/{id} doesn't return hintsAvailable (only the create response does);
// add it to ActivityResponse and drop this if the ladder length ever varies.
const HINTS_AVAILABLE = 2

/** POST …/explanation: the rubric comes along once the activity is closed (reopen). */
type Revealed = ExplanationData & { rubric?: SubmitResponse['rubric'] }

/**
 * Spot the flaw (F4c, F5): scenario → ask the author → hints → answer → Socratic retry → final
 * reveal. Server state is GET /activities/{id}; hint texts, submit responses and the explanation
 * live in component state because the GET doesn't return them.
 */
export function SpotFlawView({ activity }: { activity: ActivityResponse }) {
  const id = activity.id
  const startState = parseMasteryState(useSearchParams().get('from'))
  const [answer, setAnswer] = useState<Answer>(EMPTY_ANSWER)
  const [results, setResults] = useState<SubmitResponse[]>([])
  const [hints, setHints] = useState<HintResponse[]>([])
  // The explanation response carries the rubric once the activity is closed (reopen).
  const [explanation, setExplanation] = useState<Revealed | null>(null)
  const [retrying, setRetrying] = useState(false)

  const ask = useAskAuthor(id)
  const takeHint = useTakeHint(id)
  const submit = useSubmitAnswer(id)
  const showMe = useShowExplanation(id)

  const closed = activity.status === 'closed'
  const sentences = activity.scenario?.sentences ?? []
  const lastResult = results.at(-1)
  const lastTry = activity.tries.at(-1)
  const showForm =
    activity.status === 'active' || (activity.status === 'awaiting_retry' && retrying)
  const tryNo: 1 | 2 = activity.tries.length === 0 ? 1 : 2
  const finalResult = lastResult?.final ? lastResult : undefined

  // Reopening a closed activity: the explanation isn't in the GET, and asking for it after the
  // final try changes nothing server-side. Once only (StrictMode re-runs effects); a failure
  // shows inline with "Try again" (showMe.error below).
  const needsReveal = closed && !finalResult && !explanation
  const revealStarted = useRef(false)
  const { mutate: reveal } = showMe
  useEffect(() => {
    if (!needsReveal || revealStarted.current) return
    revealStarted.current = true
    reveal(undefined, { onSuccess: setExplanation })
  }, [needsReveal, reveal])

  const onSubmit = () => {
    // These callbacks run after the hook's refetch, when Retry may already be on screen and
    // clicked: only a submit from the retry form may close that form again.
    const fromRetryForm = retrying
    submit.mutate(answer, {
      onSuccess: (res) => {
        setResults((prev) => [...prev, res])
        if (fromRetryForm) setRetrying(false)
      },
    })
  }
  // Failures show inline next to what failed (mutation.error), not in a toast that times out.
  const onHint = () =>
    takeHint.mutate(undefined, { onSuccess: (res) => setHints((prev) => [...prev, res]) })
  const onShowMe = () => showMe.mutate(undefined, { onSuccess: setExplanation })
  const onAsk = (text: string) => ask.mutateAsync(text)

  // Submit unmounts the form and Retry unmounts the result: move focus to whichever replaced it.
  const resultRef = useRef<HTMLElement>(null)
  const prevShowForm = useRef(showForm)
  useEffect(() => {
    if (prevShowForm.current === showForm) return
    prevShowForm.current = showForm
    if (showForm) document.getElementById('answer-title')?.focus()
    else resultRef.current?.focus()
  }, [showForm])

  const rubric = finalResult?.rubric ?? explanation?.rubric
  const shownExplanation =
    finalResult?.explanation !== undefined
      ? { explanation: finalResult.explanation, sources: finalResult.sources }
      : explanation

  return (
    <div className="space-y-8">
      <section aria-labelledby="scenario-title" className="space-y-3">
        <div className="space-y-1">
          <h2 id="scenario-title" className="text-title-md">
            Does this explanation hold up?
          </h2>
          <p className="text-muted-foreground text-sm text-pretty">
            Most explanations hide exactly one wrong sentence; some are fully correct.
          </p>
        </div>
        <ScenarioList
          sentences={sentences}
          selected={showForm ? answer.flawSentenceIdx : null}
          onSelect={(idx) => setAnswer((a) => pickSentence(a, idx))}
          disabled={!showForm}
        />
      </section>

      <AuthorChat
        messages={activity.messages}
        turnsLeft={activity.turnBudget - activity.turnsUsed}
        turnBudget={activity.turnBudget}
        onAsk={onAsk}
        pending={ask.isPending}
        disabled={closed}
        error={ask.error}
      />

      {!closed && (
        <HintLadder
          hints={hints.map((h) => h.hint)}
          sources={hints.at(-1)?.sources ?? []}
          hintsUsed={activity.hintsUsed}
          hintsAvailable={HINTS_AVAILABLE}
          onTake={onHint}
          pending={takeHint.isPending}
          error={takeHint.error}
        />
      )}

      <Separator />

      {showForm ? (
        <div className="space-y-4">
          <AnswerForm
            answer={answer}
            onChange={setAnswer}
            sentenceCount={sentences.length}
            onSubmit={onSubmit}
            pending={submit.isPending}
            tryNo={tryNo}
          />
          {submit.isError && (
            <InlineError title="Couldn't check your answer" error={submit.error} />
          )}
        </div>
      ) : (
        lastTry && (
          // Focused on mount (above), which announces it; aria-live here would read it twice.
          <section ref={resultRef} tabIndex={-1} aria-label="Result" className="space-y-5">
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

      {showMe.isError && (
        <InlineError
          title="Couldn't load the explanation"
          error={showMe.error}
          onRetry={onShowMe}
        />
      )}
      {shownExplanation && <Explanation explanation={shownExplanation} />}
      {!shownExplanation && lastResult && <Sources sources={lastResult.sources} />}
      {rubric && <RubricList rubric={rubric} />}
      <MasteryChange start={startState} results={results.map((r) => r.mastery)} />
      {(closed || results.length > 0) && <MapLink courseId={activity.courseId} primary={closed} />}
    </div>
  )
}
