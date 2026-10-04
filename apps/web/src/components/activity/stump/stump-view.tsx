'use client'

import type { ActivityResponse, StumpTry, SubmitResponse } from '@lectheo/contracts'
import { STUMP_LABELS, STUMP_MAX_TRIES } from '@lectheo/domain'
import { BookOpen, CircleCheck, CircleX, GraduationCap, LoaderCircle, Trophy } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '@/components/error-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { parseMasteryState } from '../spot-flaw/logic'
import { MasteryChange, Sources } from '../spot-flaw/result-panel'
import { type StumpDraft, useSubmitStump } from './api'

/* Limits mirror SubmitStump in @lectheo/contracts (API Spec §7). */
const QUESTION = { min: 10, max: 1000 }
const KEY = { min: 1, max: 2000 }

function submitBlocker(draft: StumpDraft): string | null {
  if (draft.question.trim().length < QUESTION.min) return 'Write a question (10+ characters).'
  if (draft.answerKey.trim().length < KEY.min) return 'Add your answer key.'
  return null
}

interface FieldProps {
  id: string
  label: string
  hint: string
  value: string
  max: number
  rows: number
  onChange: (value: string) => void
}

function Field({ id, label, hint, value, max, rows, onChange }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {value.length}/{max}
        </span>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={rows}
        placeholder={hint}
      />
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
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!blocker && !pending) onSubmit()
  }
  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Your question" aria-busy={pending}>
      <Field
        id="stump-question"
        label="Your question"
        hint="Ask one specific thing the AI might get wrong."
        value={draft.question}
        max={QUESTION.max}
        rows={4}
        onChange={(question) => onChange({ ...draft, question })}
      />
      <Field
        id="stump-key"
        label="Your answer key"
        hint="The correct answer, and why. The AI never sees this."
        value={draft.answerKey}
        max={KEY.max}
        rows={3}
        onChange={(answerKey) => onChange({ ...draft, answerKey })}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={Boolean(blocker) || pending}>
          {pending && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
          {pending ? 'Refereeing…' : revising ? 'Resubmit' : 'Submit to the referee'}
        </Button>
        {blocker && <p className="text-muted-foreground text-sm">{blocker}</p>}
      </div>
      {pending && (
        <p role="status" className="text-muted-foreground text-sm">
          The referee and the AI are both thinking. This takes about 15 seconds.
        </p>
      )}
    </form>
  )
}

function Rejected({ reason, triesLeft }: { reason: string; triesLeft: number }) {
  const tries = triesLeft === 1 ? '1 try' : `${triesLeft} tries`
  return (
    <div className="bg-mastery-gray-bg space-y-1.5 rounded-lg p-4">
      <p className="text-mastery-gray flex items-center gap-2 font-medium">
        <CircleX aria-hidden className="size-4" />
        {STUMP_LABELS.rejected}
      </p>
      <p className="leading-relaxed text-pretty">{reason}</p>
      <p className="text-muted-foreground text-sm">
        {triesLeft > 0
          ? `Edit your question or key below and resubmit (${tries} left).`
          : 'No tries left. Start a new Stump the AI from the concept map.'}
      </p>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: string | null }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="leading-relaxed whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

function Accepted({ stump }: { stump: StumpTry }) {
  const lecture = stump.groundedIn === 'lecture'
  const GroundIcon = lecture ? BookOpen : GraduationCap
  const Icon = stump.aiStumped ? Trophy : CircleCheck
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
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
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

  const onSubmit = () =>
    submit.mutate(draft, {
      onSuccess: (res) => setResults((prev) => [...prev, res]),
      onError: (error) =>
        toast.error("The referee couldn't check your question", {
          description: errorMessage(error),
        }),
    })

  return (
    <div className="space-y-8">
      <section aria-labelledby="stump-title" className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 id="stump-title" className="font-serif text-xl font-medium">
            Can you stump the AI?
          </h2>
          <Badge variant="outline">Beta</Badge>
        </div>
        {guidance && (
          <p className="text-muted-foreground leading-relaxed text-pretty">{guidance}</p>
        )}
      </section>

      <Separator />

      <section aria-label="Result" aria-live="polite" className="space-y-5">
        {stump && (
          <h3 ref={resultHeading} tabIndex={-1} className="font-medium outline-none">
            Referee&apos;s verdict
          </h3>
        )}
        {stump?.valid && <Accepted stump={stump} />}
        {stump && !stump.valid && (
          <Rejected
            reason={stump.rejectionReason ?? stump.refereeNotes}
            triesLeft={STUMP_MAX_TRIES - activity.tries.length}
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

      {results.length > 0 && <Sources sources={results.at(-1)?.sources ?? []} />}
      <MasteryChange start={startState} results={results.map((r) => r.mastery)} />
    </div>
  )
}
