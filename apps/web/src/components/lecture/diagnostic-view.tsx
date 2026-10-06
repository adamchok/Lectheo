'use client'

import type {
  AnswerResponse,
  ConfidenceLevel,
  DiagnosticResultsResponse,
  Finding,
} from '@lectheo/contracts'
import { ArrowRight, CircleCheck, CircleX, TriangleAlert } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { isApiClientError } from '@/client/api'
import { useFocusOnMount } from '@/client/focus'
import { pluralize } from '@/client/format'
import { isBareShortcut } from '@/client/keyboard'
import {
  useDiagnosticAnswer,
  useDiagnosticConfidence,
  useDiagnosticResults,
  useDiagnosticSession,
  useStartDiagnostic,
} from '@/client/queries'
import { useStartPractice } from '@/client/practice'
import {
  CONFIDENCE_OPTIONS,
  ConfidencePicker,
  confidenceForKey,
} from '@/components/confidence-picker'
import { ErrorState, errorMessage } from '@/components/error-state'
import { KeyHint } from '@/components/key-hint'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LectureFrame } from './lecture-frame'
import { Spinner } from '@/components/ui/spinner'

/** /lectures/[id]/diagnostic — adaptive, confidence-first diagnostic (F3). */
export function DiagnosticView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Diagnostic"
      reading
      description="A few questions on this lecture's key ideas. Rate your confidence first, then pick an answer."
    >
      {(lecture) => (
        <div>
          <DiagnosticRunner lectureId={lectureId} courseId={lecture.courseId} />
        </div>
      )}
    </LectureFrame>
  )
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

const FINDING_LABEL: Record<Finding, string> = {
  confident_mistake: 'Confident mistake',
  possible_confident_mistake: 'Sure, but wrong',
  wrong: 'Wrong',
  possible_slip: 'Possible slip',
  unsure_right: 'Right, but unsure',
  right: 'Right',
}

interface Question {
  id: string
  stem: string
  isFollowUp: boolean
  confidence?: ConfidenceLevel
}

function Loading({ label }: { label: string }) {
  return (
    <Skeleton label={label} className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </Skeleton>
  )
}

function Note({ children }: { children: string }) {
  return (
    <p className="bg-muted text-muted-foreground text-body-sm rounded-lg px-4 py-3">{children}</p>
  )
}

/** Every verified question for this lecture has been seen (start → 409 no_items). */
function FinishedState({ lectureId, courseId }: { lectureId: string; courseId: string }) {
  return (
    <section className="bg-card space-y-4 rounded-xl border p-6 text-center shadow-sm">
      <CircleCheck aria-hidden className="text-mastery-green mx-auto size-5" />
      <h2 className="text-title-md">You&apos;ve finished this diagnostic</h2>
      <p className="text-muted-foreground text-body-sm">
        You&apos;ve answered every question we have for this lecture. Keep going with practice on
        the concept map.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={`/courses/${courseId}` as Route}>
            Open the concept map
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/lectures/${lectureId}` as Route}>Back to the lecture</Link>
        </Button>
      </div>
    </section>
  )
}

const isNoItemsLeft = (error: unknown): boolean =>
  isApiClientError(error) && error.code === 'invalid_state' && error.details?.reason === 'no_items'

function DiagnosticRunner({ lectureId, courseId }: { lectureId: string; courseId: string }) {
  const start = useStartDiagnostic(lectureId)
  const session = useDiagnosticSession(start.data?.sessionId)

  if (start.isError && isNoItemsLeft(start.error)) {
    return <FinishedState lectureId={lectureId} courseId={courseId} />
  }
  if (start.isError) {
    return (
      <ErrorState
        title="Couldn't start the diagnostic"
        error={start.error}
        onRetry={() => start.refetch()}
      />
    )
  }
  if (session.isError) {
    return (
      <ErrorState
        title="Couldn't load your questions"
        error={session.error}
        onRetry={() => session.refetch()}
      />
    )
  }
  if (!start.data || !session.data) return <Loading label="Loading questions" />

  const unanswered: Question[] = session.data.items
    .filter((i) => !i.answered)
    .map((i) => ({ id: i.id, stem: i.stem, isFollowUp: i.isFollowUp, confidence: i.confidence }))
  return (
    <DiagnosticFlow
      key={start.data.sessionId}
      courseId={courseId}
      sessionId={start.data.sessionId}
      initial={unanswered}
      answeredBefore={session.data.items.length - unanswered.length}
      note={start.data.note}
    />
  )
}

interface FlowProps {
  sessionId: string
  courseId: string
  /** Unanswered questions in session order (resume). */
  initial: Question[]
  answeredBefore: number
  note?: string
}

function DiagnosticFlow({ sessionId, courseId, initial, answeredBefore, note }: FlowProps) {
  const [queue, setQueue] = useState(initial)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<ReadonlyMap<string, AnswerResponse>>(new Map())
  const current = queue[index]

  if (!current) {
    return (
      <DiagnosticResults sessionId={sessionId} courseId={courseId} answers={answers} note={note} />
    )
  }

  const handleAnswered = (itemId: string, result: AnswerResponse) => {
    setAnswers((prev) => new Map(prev).set(itemId, result))
    const followUp = result.followUp
    if (followUp && !queue.some((q) => q.id === followUp.itemId)) {
      // The follow-up comes straight after the question that triggered it (F3.5).
      setQueue((prev) => [
        ...prev.slice(0, index + 1),
        { id: followUp.itemId, stem: followUp.stem, isFollowUp: true },
        ...prev.slice(index + 1),
      ])
    }
  }

  const showNote = note && index === 0 && answeredBefore === 0
  return (
    <div className="space-y-6">
      {showNote && <Note>{note}</Note>}
      <p className="text-muted-foreground text-body-sm" aria-live="polite">
        Question {answeredBefore + index + 1} of {answeredBefore + queue.length}
        {current.isFollowUp && ' · follow-up on the same idea'}
      </p>
      <QuestionCard
        key={current.id}
        sessionId={sessionId}
        question={current}
        isLast={index === queue.length - 1}
        onAnswered={(result) => handleAnswered(current.id, result)}
        onNext={() => setIndex((i) => i + 1)}
      />
    </div>
  )
}

interface QuestionCardProps {
  sessionId: string
  question: Question
  isLast: boolean
  onAnswered: (result: AnswerResponse) => void
  onNext: () => void
}

function QuestionCard({ sessionId, question, isLast, onAnswered, onNext }: QuestionCardProps) {
  const confidence = useDiagnosticConfidence(sessionId)
  const answer = useDiagnosticAnswer(sessionId)
  const [level, setLevel] = useState<ConfidenceLevel | undefined>(question.confidence)
  const [chosen, setChosen] = useState<string>()
  const options = confidence.data?.options
  const feedback = answer.data
  const { mutate: sendConfidence } = confidence

  // Resumed after confidence was recorded: the same level returns the same options.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || !question.confidence) return
    resumed.current = true
    sendConfidence({ itemId: question.id, level: question.confidence })
  }, [sendConfidence, question])

  // Only a rating made here moves focus to the options; a resumed question keeps it on the stem.
  const [ratedHere, setRatedHere] = useState(false)
  const handleRate = (next: ConfidenceLevel) => {
    if (confidence.isPending || options) return
    setRatedHere(true)
    setLevel(next)
    sendConfidence({ itemId: question.id, level: next })
  }

  const handlePick = (optionId: string) => {
    if (answer.isPending || feedback) return
    setChosen(optionId)
    answer.mutate({ itemId: question.id, optionId }, { onSuccess: onAnswered })
  }

  // 1–4 rate confidence, then A–E pick an option, only while focus is inside this question
  // (WCAG 2.1.4); never while typing or with a modifier held.
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!isBareShortcut(event.nativeEvent)) return
    if (!options) {
      // By physical key, so AZERTY layouts (digits behind Shift) work too.
      const next = confidenceForKey(event.code)
      if (!next) return
      event.preventDefault()
      handleRate(next)
      return
    }
    if (event.shiftKey) return
    const option = options[LETTERS.indexOf(event.key.toUpperCase() as (typeof LETTERS)[number])]
    if (!option || feedback) return
    event.preventDefault()
    handlePick(option.id)
  }

  // "Next question" unmounts with the previous card: focus the new question, not <body>.
  const heading = useFocusOnMount<HTMLHeadingElement>()
  const levelLabel = CONFIDENCE_OPTIONS.find((o) => o.value === level)?.label
  return (
    <section
      className="bg-card space-y-6 rounded-xl border p-6 shadow-sm"
      aria-label="Question"
      onKeyDown={handleKeyDown}
    >
      <h2 ref={heading} tabIndex={-1} className="text-title-md text-balance">
        {question.stem}
      </h2>

      {options ? (
        <>
          <p className="text-muted-foreground text-body-sm">Confidence: {levelLabel}</p>
          <OptionList
            options={options}
            chosen={chosen}
            correctOptionId={feedback?.correctOptionId}
            disabled={answer.isPending || Boolean(feedback)}
            onPick={handlePick}
            focusOnMount={ratedHere}
          />
          {answer.isPending && (
            <p className="text-muted-foreground text-body-sm flex items-center gap-2">
              <Spinner /> Checking…
            </p>
          )}
          {answer.isError && (
            <p role="alert" className="text-destructive text-body-sm">
              {errorMessage(answer.error)}
            </p>
          )}
        </>
      ) : (
        <>
          <ConfidencePicker
            value={level}
            onChange={handleRate}
            disabled={confidence.isPending}
            legend="How confident are you? Pick one to see the answers."
          />
          {confidence.isError && (
            <p role="alert" className="text-destructive text-body-sm">
              {errorMessage(confidence.error)}
            </p>
          )}
        </>
      )}

      {/* Always mounted, so the verdict is announced when it arrives (WCAG 4.1.3). */}
      <p role="status" className="sr-only">
        {feedback && `Answer checked: ${verdictText(feedback)}`}
      </p>
      {feedback && <FeedbackCard feedback={feedback} isLast={isLast} onNext={onNext} />}
    </section>
  )
}

interface OptionListProps {
  options: { id: string; text: string }[]
  chosen?: string
  /** Set once answered. */
  correctOptionId?: string
  disabled: boolean
  onPick: (optionId: string) => void
  /** Options replaced the confidence picker the user just used: keep focus in the question. */
  focusOnMount: boolean
}

function OptionList({
  options,
  chosen,
  correctOptionId,
  disabled,
  onPick,
  focusOnMount,
}: OptionListProps) {
  // The list, not option A: a stray Enter must not submit an answer.
  const list = useRef<HTMLUListElement>(null)
  const shouldFocus = useRef(focusOnMount)
  useEffect(() => {
    if (shouldFocus.current) list.current?.focus()
  }, [])
  return (
    <ul ref={list} tabIndex={-1} className="space-y-2 rounded-lg" aria-label="Answer options">
      {options.map((option, i) => {
        const isCorrect = correctOptionId === option.id
        const isWrongPick = correctOptionId !== undefined && chosen === option.id && !isCorrect
        return (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onPick(option.id)}
              aria-disabled={disabled || undefined}
              aria-keyshortcuts={LETTERS[i]}
              aria-pressed={chosen === option.id}
              className={cn(
                'hover:border-primary/50 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                'aria-disabled:cursor-default',
                chosen === option.id && !correctOptionId && 'border-primary bg-accent',
                isCorrect && 'border-mastery-green-solid bg-mastery-green-bg',
                isWrongPick && 'border-destructive bg-destructive/10',
              )}
            >
              <KeyHint className="mt-0.5">{LETTERS[i]}</KeyHint>
              <span className="flex-1">{option.text}</span>
              {isCorrect && (
                <CircleCheck aria-label="Correct answer" className="text-mastery-green size-5" />
              )}
              {isWrongPick && (
                <CircleX aria-label="Your answer" className="text-destructive size-5" />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface FeedbackCardProps {
  feedback: AnswerResponse
  isLast: boolean
  onNext: () => void
}

const verdictText = (feedback: AnswerResponse): string =>
  `${feedback.correct ? 'Correct' : 'Not quite'} · ${FINDING_LABEL[feedback.finding]}`

/** Immediate feedback after each answer (F3.4): verdict, why, explanation, lecture link. */
function FeedbackCard({ feedback, isLast, onNext }: FeedbackCardProps) {
  const Icon = feedback.correct ? CircleCheck : CircleX
  const reasons = feedback.mastery.reasons ?? []
  const next = feedback.followUp
    ? 'One more on this idea'
    : isLast
      ? 'See results'
      : 'Next question'
  return (
    <div className="bg-muted/50 space-y-3 rounded-lg border p-4">
      <p className="text-heading flex items-center gap-2">
        <Icon
          aria-hidden
          className={cn('size-5', feedback.correct ? 'text-mastery-green' : 'text-destructive')}
        />
        {verdictText(feedback)}
      </p>
      {feedback.whyYourChoiceIsWrong && (
        <p className="text-body-sm">{feedback.whyYourChoiceIsWrong}</p>
      )}
      <p className="text-muted-foreground text-body-sm">{feedback.explanation}</p>
      {feedback.source && <SourceRef source={feedback.source} />}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="space-y-1">
          <MasteryBadge
            state={feedback.mastery.state}
            confidentMistake={feedback.mastery.confidentMistake}
            size="sm"
          />
          {reasons.length > 0 && (
            <p className="text-muted-foreground text-caption">{reasons.join(' · ')}</p>
          )}
        </div>
        <Button onClick={onNext} autoFocus>
          {next}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  )
}

interface ResultsProps {
  sessionId: string
  courseId: string
  /** Answers from this visit, for the "why" on the headline card. */
  answers: ReadonlyMap<string, AnswerResponse>
  note?: string
}

/** Results ordered confident mistakes → wrong → unsure-right → right (F3.6). */
function DiagnosticResults({ sessionId, courseId, answers, note }: ResultsProps) {
  const results = useDiagnosticResults(sessionId)
  // "See results" unmounted with the last question: land on the results heading.
  const heading = useRef<HTMLHeadingElement>(null)
  const loaded = results.data !== undefined
  useEffect(() => {
    if (loaded) heading.current?.focus()
  }, [loaded])
  if (results.isError) {
    return (
      <ErrorState
        title="Couldn't load your results"
        error={results.error}
        onRetry={() => results.refetch()}
      />
    )
  }
  if (!results.data) return <Loading label="Loading results" />

  const { findings, summary } = results.data
  const headline = findings.find((f) => f.finding === 'confident_mistake')
  const rest = findings.filter((f) => f !== headline)
  const shownNote = results.data.note ?? note
  const mistakes = pluralize(summary.confidentMistakes, 'confident mistake')
  // Findings come worst first: with no confident mistake, offer practice on the weakest one.
  const weakest = headline ? undefined : findings.find((f) => f.finding !== 'right')
  return (
    <div className="space-y-6">
      <h2 ref={heading} tabIndex={-1} className="text-title-lg">
        Your results
      </h2>
      {shownNote && <Note>{shownNote}</Note>}
      {headline && (
        <ConfidentMistakeCard finding={headline} answer={answers.get(headline.itemId)} />
      )}
      <p className="text-muted-foreground text-body-sm">
        {pluralize(summary.total, 'question')} · {mistakes} · {summary.wrong} wrong ·{' '}
        {summary.unsureRight} right but unsure · {summary.right} right
      </p>
      {rest.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {rest.map((f) => (
            <li key={f.itemId} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>
                <span className="text-heading">{f.conceptName}</span>
                <span
                  className={cn(
                    'text-muted-foreground text-body-sm ml-2',
                    f.finding === 'possible_slip' && 'italic',
                  )}
                >
                  {FINDING_LABEL[f.finding]}
                </span>
              </span>
              {f.source && <SourceRef source={f.source} compact />}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link href={`/courses/${courseId}` as Route}>
            See it on the map
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        {weakest && <PracticeWeakestButton finding={weakest} />}
      </div>
    </div>
  )
}

function PracticeWeakestButton({ finding }: { finding: ResultFinding }) {
  const { startPractice, isPending } = useStartPractice()
  return (
    <Button
      variant="outline"
      pending={isPending}
      onClick={() => startPractice({ conceptId: finding.conceptId, type: 'spot_flaw' })}
    >
      Practice the weakest concept
    </Button>
  )
}

type ResultFinding = DiagnosticResultsResponse['findings'][number]

interface ConfidentMistakeCardProps {
  finding: ResultFinding
  answer?: AnswerResponse
}

/** The headline finding (Spec §4.1 step 5) with a CTA into Spot the flaw on that concept. */
function ConfidentMistakeCard({ finding, answer }: ConfidentMistakeCardProps) {
  const { startPractice, isPending } = useStartPractice()
  const why =
    answer?.whyYourChoiceIsWrong ??
    'You were sure of your answer here, but it was wrong. Revisit the lecture moment below.'

  // A confident mistake is red by definition (F6), so the result can show red → amber/green.
  const handlePractice = () =>
    startPractice({ conceptId: finding.conceptId, type: 'spot_flaw', mastery: 'red' })

  return (
    <section
      aria-labelledby="confident-mistake-title"
      className="border-destructive/40 bg-destructive/5 space-y-3 rounded-xl border-2 p-6"
    >
      <p className="text-destructive text-overline flex items-center gap-2">
        <TriangleAlert aria-hidden className="size-4" /> Confident mistake
      </p>
      <h3 id="confident-mistake-title" className="text-title-md">
        {finding.conceptName}
      </h3>
      <p className="text-body">{why}</p>
      {finding.source && <SourceRef source={finding.source} />}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="outline" pending={isPending} onClick={handlePractice}>
          Practice this
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </section>
  )
}
