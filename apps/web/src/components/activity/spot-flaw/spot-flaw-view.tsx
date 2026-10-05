'use client'

import type { ActivityResponse, SubmitResponse } from '@lectheo/contracts'
import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/components/error-state'
import { Separator } from '@/components/ui/separator'
import { useAskAuthor, useShowExplanation, useSubmitAnswer, useTakeHint } from './api'
import { AnswerForm } from './answer-form'
import { AuthorChat } from './author-chat'
import { HintLadder } from './hint-ladder'
import { EMPTY_ANSWER, parseMasteryState, pickSentence, type Answer } from './logic'
import {
  Explanation,
  type ExplanationData,
  GuidingQuestion,
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

const failed = (title: string) => (error: unknown) =>
  toast.error(title, { description: errorMessage(error) })

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
  const [hints, setHints] = useState<string[]>([])
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
  // final try changes nothing server-side.
  const needsReveal = closed && !finalResult && !explanation
  const { mutate: reveal, isIdle: revealIdle } = showMe
  useEffect(() => {
    if (needsReveal && revealIdle) reveal(undefined, { onSuccess: setExplanation })
  }, [needsReveal, revealIdle, reveal])

  const onSubmit = () =>
    submit.mutate(answer, {
      onSuccess: (res) => {
        setResults((prev) => [...prev, res])
        setRetrying(false)
      },
      onError: failed("Couldn't check your answer"),
    })
  const onHint = () =>
    takeHint.mutate(undefined, {
      onSuccess: (res) => setHints((prev) => [...prev, res.hint]),
      onError: failed("Couldn't load a hint"),
    })
  const onShowMe = () =>
    showMe.mutate(undefined, {
      onSuccess: setExplanation,
      onError: failed("Couldn't load the explanation"),
    })
  const onAsk = (text: string) =>
    ask.mutateAsync(text).catch((error: unknown) => {
      failed("The author couldn't answer")(error)
      throw error
    })

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
          <h2 id="scenario-title" className="font-serif text-xl font-medium">
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
      />

      {!closed && (
        <HintLadder
          hints={hints}
          hintsUsed={activity.hintsUsed}
          hintsAvailable={HINTS_AVAILABLE}
          onTake={onHint}
          pending={takeHint.isPending}
        />
      )}

      <Separator />

      {showForm ? (
        <AnswerForm
          answer={answer}
          onChange={setAnswer}
          sentenceCount={sentences.length}
          onSubmit={onSubmit}
          pending={submit.isPending}
          tryNo={tryNo}
        />
      ) : (
        lastTry && (
          // Focused on mount (above), which announces it; aria-live here would read it twice.
          <section
            ref={resultRef}
            tabIndex={-1}
            aria-label="Result"
            className="space-y-5 outline-none"
          >
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

      {shownExplanation && <Explanation explanation={shownExplanation} />}
      {!shownExplanation && lastResult && <Sources sources={lastResult.sources} />}
      {rubric && <RubricList rubric={rubric} />}
      <MasteryChange
        start={startState}
        results={results.map((r) => r.mastery)}
        courseId={activity.courseId}
      />
    </div>
  )
}
