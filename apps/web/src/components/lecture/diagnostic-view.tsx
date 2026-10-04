'use client'

import type {
  AnswerResponse,
  ConfidenceLevel,
  DiagnosticResultsResponse,
  Finding,
} from '@lectheo/contracts'
import { ArrowRight, CircleCheck, CircleX, Loader2, Target } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { isBareShortcut } from '@/client/keyboard'
import {
  useDiagnosticAnswer,
  useDiagnosticConfidence,
  useDiagnosticResults,
  useDiagnosticSession,
  useStartActivity,
  useStartDiagnostic,
} from '@/client/queries'
import { CONFIDENCE_OPTIONS, ConfidencePicker } from '@/components/confidence-picker'
import { ErrorState, errorMessage } from '@/components/error-state'
import { KeyHint } from '@/components/key-hint'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { LectureFrame } from './lecture-frame'

/** /lectures/[id]/diagnostic — adaptive, confidence-first diagnostic (F3). */
export function DiagnosticView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Diagnostic"
      description="A few questions on the ideas you flagged. Rate your confidence first, then pick an answer."
    >
      {() => (
        <div className="mx-auto max-w-3xl">
          <DiagnosticRunner lectureId={lectureId} />
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
    <div aria-busy aria-label={label} className="space-y-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-28 w-full rounded-xl" />
    </div>
  )
}

function Note({ children }: { children: string }) {
  return <p className="bg-muted text-muted-foreground rounded-lg px-4 py-3 text-sm">{children}</p>
}

function DiagnosticRunner({ lectureId }: { lectureId: string }) {
  const start = useStartDiagnostic(lectureId)
  const session = useDiagnosticSession(start.data?.sessionId)

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
      sessionId={start.data.sessionId}
      initial={unanswered}
      answeredBefore={session.data.items.length - unanswered.length}
      note={start.data.note}
    />
  )
}

interface FlowProps {
  sessionId: string
  /** Unanswered questions in session order (resume). */
  initial: Question[]
  answeredBefore: number
  note?: string
}

function DiagnosticFlow({ sessionId, initial, answeredBefore, note }: FlowProps) {
  const [queue, setQueue] = useState(initial)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<ReadonlyMap<string, AnswerResponse>>(new Map())
  const current = queue[index]

  if (!current) return <DiagnosticResults sessionId={sessionId} answers={answers} note={note} />

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
      <p className="text-muted-foreground text-sm" aria-live="polite">
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

  const handleRate = (next: ConfidenceLevel) => {
    if (confidence.isPending || options) return
    setLevel(next)
    sendConfidence({ itemId: question.id, level: next })
  }

  const handlePick = (optionId: string) => {
    if (answer.isPending || feedback) return
    setChosen(optionId)
    answer.mutate({ itemId: question.id, optionId }, { onSuccess: onAnswered })
  }
  const pickRef = useRef(handlePick)
  useEffect(() => {
    pickRef.current = handlePick
  })

  // A–D pick an option once options are shown (1–4 rate confidence in ConfidencePicker).
  useEffect(() => {
    if (!options || feedback) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey || !isBareShortcut(event)) return
      const letter = event.key.toUpperCase() as (typeof LETTERS)[number]
      const option = options[LETTERS.indexOf(letter)]
      if (!option) return
      event.preventDefault()
      pickRef.current(option.id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [options, feedback])

  const levelLabel = CONFIDENCE_OPTIONS.find((o) => o.value === level)?.label
  return (
    <section className="bg-card space-y-6 rounded-xl border p-6 shadow-sm" aria-label="Question">
      <h2 className="text-lg leading-snug font-semibold text-balance">{question.stem}</h2>

      {options ? (
        <>
          <p className="text-muted-foreground text-sm">Confidence: {levelLabel}</p>
          <OptionList
            options={options}
            chosen={chosen}
            correctOptionId={feedback?.correctOptionId}
            disabled={answer.isPending || Boolean(feedback)}
            onPick={handlePick}
          />
          {answer.isPending && (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Checking…
            </p>
          )}
          {answer.isError && (
            <p role="alert" className="text-destructive text-sm">
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
            <p role="alert" className="text-destructive text-sm">
              {errorMessage(confidence.error)}
            </p>
          )}
        </>
      )}

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
}

function OptionList({ options, chosen, correctOptionId, disabled, onPick }: OptionListProps) {
  return (
    <ul className="space-y-2" aria-label="Answer options">
      {options.map((option, i) => {
        const isCorrect = correctOptionId === option.id
        const isWrongPick = correctOptionId !== undefined && chosen === option.id && !isCorrect
        return (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => onPick(option.id)}
              disabled={disabled}
              aria-pressed={chosen === option.id}
              className={cn(
                'hover:border-primary/50 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                'focus-visible:ring-ring/60 outline-none focus-visible:ring-2 disabled:cursor-default',
                chosen === option.id && !correctOptionId && 'border-primary bg-accent',
                isCorrect && 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
                isWrongPick && 'border-destructive bg-destructive/10',
              )}
            >
              <KeyHint className="mt-0.5">{LETTERS[i]}</KeyHint>
              <span className="flex-1">{option.text}</span>
              {isCorrect && (
                <CircleCheck aria-label="Correct answer" className="size-5 text-emerald-600" />
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

/** Immediate feedback after each answer (F3.4): verdict, why, explanation, lecture link. */
function FeedbackCard({ feedback, isLast, onNext }: FeedbackCardProps) {
  const Icon = feedback.correct ? CircleCheck : CircleX
  const next = feedback.followUp
    ? 'One more on this idea'
    : isLast
      ? 'See results'
      : 'Next question'
  return (
    <div aria-live="polite" className="bg-muted/50 space-y-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 font-semibold">
        <Icon
          aria-hidden
          className={cn('size-5', feedback.correct ? 'text-emerald-600' : 'text-destructive')}
        />
        {feedback.correct ? 'Correct' : 'Not quite'} · {FINDING_LABEL[feedback.finding]}
      </p>
      {feedback.whyYourChoiceIsWrong && <p className="text-sm">{feedback.whyYourChoiceIsWrong}</p>}
      <p className="text-muted-foreground text-sm">{feedback.explanation}</p>
      {feedback.source && <SourceRef source={feedback.source} />}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <MasteryBadge
          state={feedback.mastery.state}
          reasons={feedback.mastery.reasons}
          confidentMistake={feedback.mastery.confidentMistake}
          size="sm"
        />
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
  /** Answers from this visit, for the "why" on the headline card. */
  answers: ReadonlyMap<string, AnswerResponse>
  note?: string
}

/** Results ordered confident mistakes → wrong → unsure-right → right (F3.6). */
function DiagnosticResults({ sessionId, answers, note }: ResultsProps) {
  const results = useDiagnosticResults(sessionId)
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
  const mistakes = `${summary.confidentMistakes} confident ${summary.confidentMistakes === 1 ? 'mistake' : 'mistakes'}`
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Your results</h2>
      {shownNote && <Note>{shownNote}</Note>}
      {headline && (
        <ConfidentMistakeCard finding={headline} answer={answers.get(headline.itemId)} />
      )}
      <p className="text-muted-foreground text-sm">
        {summary.total} questions · {mistakes} · {summary.wrong} wrong · {summary.unsureRight} right
        but unsure · {summary.right} right
      </p>
      {rest.length > 0 && (
        <ul className="divide-y rounded-xl border">
          {rest.map((f) => (
            <li key={f.itemId} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span>
                <span className="font-medium">{f.conceptName}</span>
                <span
                  className={cn(
                    'text-muted-foreground ml-2 text-sm',
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
    </div>
  )
}

type ResultFinding = DiagnosticResultsResponse['findings'][number]

interface ConfidentMistakeCardProps {
  finding: ResultFinding
  answer?: AnswerResponse
}

/** The headline finding (Spec §4.1 step 5) with a CTA into Spot the flaw on that concept. */
function ConfidentMistakeCard({ finding, answer }: ConfidentMistakeCardProps) {
  const router = useRouter()
  const practice = useStartActivity()
  const why =
    answer?.whyYourChoiceIsWrong ??
    'You were sure of your answer, and the follow-up on the same idea was wrong too.'

  const handlePractice = () =>
    practice.mutate(
      { conceptId: finding.conceptId, type: 'spot_flaw' },
      { onSuccess: (activity) => router.push(`/activities/${activity.id}` as Route) },
    )

  return (
    <section
      aria-labelledby="confident-mistake-title"
      className="border-destructive/40 bg-destructive/5 space-y-3 rounded-xl border-2 p-6"
    >
      <p className="text-destructive flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
        <Target aria-hidden className="size-4" /> Confident mistake
      </p>
      <h3 id="confident-mistake-title" className="text-2xl font-semibold">
        {finding.conceptName}
      </h3>
      <p>{why}</p>
      {finding.source && <SourceRef source={finding.source} />}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button size="lg" disabled={practice.isPending} onClick={handlePractice}>
          {practice.isPending && <Loader2 aria-hidden className="animate-spin" />}
          Practice this
          <ArrowRight aria-hidden />
        </Button>
        {practice.isError && (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(practice.error)}
          </p>
        )}
      </div>
    </section>
  )
}
