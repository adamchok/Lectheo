'use client'

import type { ActivityResponse, StumpTry, SubmitResponse } from '@lectheo/contracts'
import { STUMP_LABELS, STUMP_MAX_TRIES } from '@lectheo/domain'
import { BookOpen, Check, CircleX, GraduationCap, Trophy } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { InlineError, JudgeNote } from '../shared'
import { parseMasteryState } from '../spot-flaw/logic'
import { MapLink, MasteryChange, Sources } from '../spot-flaw/result-panel'
import { type StumpDraft, useSubmitStump } from './api'

/* Limits mirror SubmitStump in @lectheo/contracts (API Spec §7). */
const QUESTION = { min: 10, max: 1000 }
const KEY = { min: 1, max: 2000 }

const FIELD_IDS = { question: 'stump-question', key: 'stump-key' } as const

interface Blocker {
  field: keyof typeof FIELD_IDS
  message: string
}

function submitBlocker(draft: StumpDraft): Blocker | null {
  if (draft.question.trim().length < QUESTION.min) {
    return { field: 'question', message: 'Write a question (10+ characters).' }
  }
  if (draft.answerKey.trim().length < KEY.min) {
    return { field: 'key', message: 'Add your answer key.' }
  }
  return null
}

interface FieldProps {
  id: string
  label: string
  hint: string
  value: string
  max: number
  rows: number
  invalid: boolean
  onChange: (value: string) => void
}

/** Label above, helper text below (linked), counter beside the label (Design System §3 Forms). */
function Field({ id, label, hint, value, max, rows, invalid, onChange }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-label">
          {label}
        </label>
        <span className="text-mono-sm text-muted-foreground tabular-nums">
          {value.length}/{max}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={rows}
        required
        aria-invalid={invalid || undefined}
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-caption text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

interface StumpFormProps {
  draft: StumpDraft
  onChange: (draft: StumpDraft) => void
  onSubmit: () => void
  pending: boolean
  revising: boolean
}

function StumpForm({ draft, onChange, onSubmit, pending, revising }: StumpFormProps) {
  const blocker = submitBlocker(draft)
  // Fields are marked invalid only after a submit that couldn't run, not while typing.
  const [tried, setTried] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (pending) return
    if (blocker) {
      setTried(true)
      document.getElementById(FIELD_IDS[blocker.field])?.focus()
      return
    }
    onSubmit()
  }
  const invalid = (field: Blocker['field']) => tried && blocker?.field === field
  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-4"
      aria-label="Your question"
      aria-busy={pending}
    >
      <Field
        id={FIELD_IDS.question}
        label="Your question"
        hint="Ask one specific thing the AI might get wrong."
        value={draft.question}
        max={QUESTION.max}
        rows={4}
        invalid={invalid('question')}
        onChange={(question) => onChange({ ...draft, question })}
      />
      <Field
        id={FIELD_IDS.key}
        label="Your answer key"
        hint="The correct answer, and why. The AI never sees this."
        value={draft.answerKey}
        max={KEY.max}
        rows={3}
        invalid={invalid('key')}
        onChange={(answerKey) => onChange({ ...draft, answerKey })}
      />
      <div className="flex flex-wrap items-center gap-3">
        {/* Stays focusable while it can't run, with the reason beside it (Design System §3). */}
        <Button
          type="submit"
          size="lg"
          aria-disabled={Boolean(blocker) || pending}
          aria-describedby={blocker ? 'stump-blocker' : undefined}
        >
          {pending && <Spinner />}
          {pending ? 'Refereeing…' : revising ? 'Resubmit' : 'Submit to the referee'}
        </Button>
        {blocker && (
          <p id="stump-blocker" className="text-muted-foreground text-body-sm">
            {blocker.message}
          </p>
        )}
      </div>
      {/* Always mounted, so the wait message is announced when it appears. */}
      <p role="status" className="text-muted-foreground text-body-sm empty:hidden">
        {pending ? 'The referee and the AI are both thinking. This takes about 15 seconds.' : ''}
      </p>
    </form>
  )
}

interface RejectedProps {
  reason: string
  triesLeft: number
  courseId: string
}

function Rejected({ reason, triesLeft, courseId }: RejectedProps) {
  const tries = triesLeft === 1 ? '1 try' : `${triesLeft} tries`
  return (
    <div className="bg-mastery-gray-bg space-y-1.5 rounded-lg p-4">
      <p className="text-mastery-gray flex items-center gap-2 font-medium">
        <CircleX aria-hidden className="size-4" />
        {STUMP_LABELS.rejected}
      </p>
      <p className="leading-relaxed text-pretty">{reason}</p>
      <p className="text-muted-foreground text-body-sm">
        {triesLeft > 0 ? (
          `Edit your question or key below and resubmit (${tries} left).`
        ) : (
          <>
            No tries left. Start a new Stump the AI from{' '}
            <Link
              href={`/courses/${courseId}` as Route}
              className="text-primary font-medium underline underline-offset-4"
            >
              the concept map
            </Link>
            .
          </>
        )}
      </p>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="leading-relaxed whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

function Accepted({ stump }: { stump: StumpTry }) {
  const lecture = stump.groundedIn === 'lecture'
  const GroundIcon = lecture ? BookOpen : GraduationCap
  const Icon = stump.aiStumped ? Trophy : Check
  return (
    <div className="space-y-5">
      <p className="bg-mastery-green-bg text-mastery-green inline-flex items-center gap-2 rounded-full px-3 py-1 font-medium">
        <Icon aria-hidden className="size-4" />
        {stump.aiStumped ? STUMP_LABELS.stumped : STUMP_LABELS.accepted}
      </p>
      <dl className="space-y-4">
        <Detail label="Your question">{stump.question}</Detail>
        <Detail label="Your answer key">{stump.studentKey}</Detail>
        <Detail label="The AI's answer">{stump.aiAnswer}</Detail>
        <Detail label="Referee">{stump.refereeNotes}</Detail>
      </dl>
      <p className="text-caption text-muted-foreground flex items-center gap-1.5">
        <GroundIcon aria-hidden className="size-3.5" />
        {lecture ? 'Grounded in the lecture' : 'Uses standard course knowledge'}
      </p>
    </div>
  )
}

const EMPTY: StumpDraft = { question: '', answerKey: '' }

/** Edit & resubmit starts from the rejected question, also after a reload. */
const draftFrom = (stump: StumpTry | undefined): StumpDraft =>
  stump && !stump.valid ? { question: stump.question, answerKey: stump.studentKey } : EMPTY

/**
 * Stump the AI (F4d, beta): question + key → referee → the AI answers without the key →
 * "Accepted" / "Accepted · you stumped the AI". No points (F6.3). The verdict comes from the
 * last try in GET /activities/{id}, so a reload shows it too; sources and mastery are per session.
 */
export function StumpView({ activity }: { activity: ActivityResponse }) {
  const startState = parseMasteryState(useSearchParams().get('from'))
  const stump = activity.tries.at(-1)?.stump
  const [draft, setDraft] = useState<StumpDraft>(() => draftFrom(stump))
  const [results, setResults] = useState<SubmitResponse[]>([])
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const submit = useSubmitStump(activity.id)

  const guidance = activity.messages[0]?.content
  const closed = activity.status === 'closed'

  // After each submit, move focus to the verdict (the form may have unmounted).
  useEffect(() => {
    if (results.length > 0) resultHeading.current?.focus()
  }, [results.length])

  // A failure shows inline under the form (submit.error); the draft stays as typed.
  const onSubmit = () =>
    submit.mutate(draft, { onSuccess: (res) => setResults((prev) => [...prev, res]) })

  return (
    <div className="space-y-8">
      <section aria-labelledby="stump-title" className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 id="stump-title" className="text-title-md">
            Can you stump the AI?
          </h2>
          <Badge variant="outline">Beta</Badge>
        </div>
        {guidance && (
          <p className="text-muted-foreground leading-relaxed text-pretty">{guidance}</p>
        )}
      </section>

      <Separator />

      {/* Not live: the verdict heading takes focus after a submit, which announces it. */}
      <section aria-label="Result" className="space-y-5">
        {stump && (
          <div className="space-y-1">
            <h3 ref={resultHeading} tabIndex={-1} className="text-heading">
              Referee&apos;s verdict
            </h3>
            <JudgeNote />
          </div>
        )}
        {stump?.valid && <Accepted stump={stump} />}
        {stump && !stump.valid && (
          <Rejected
            reason={stump.rejectionReason ?? stump.refereeNotes}
            triesLeft={STUMP_MAX_TRIES - activity.tries.length}
            courseId={activity.courseId}
          />
        )}
      </section>

      {!closed && (
        <StumpForm
          draft={draft}
          onChange={setDraft}
          onSubmit={onSubmit}
          pending={submit.isPending}
          revising={activity.tries.length > 0}
        />
      )}
      {!closed && submit.isError && (
        <InlineError title="The referee couldn't check your question" error={submit.error} />
      )}

      {results.length > 0 && <Sources sources={results.at(-1)?.sources ?? []} />}
      <MasteryChange start={startState} results={results.map((r) => r.mastery)} />
      {(closed || results.length > 0) && <MapLink courseId={activity.courseId} primary={closed} />}
    </div>
  )
}
