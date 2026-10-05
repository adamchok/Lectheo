'use client'

import { CircleCheck, LoaderCircle, SearchX, type LucideIcon } from 'lucide-react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { CORRECTION_MAX, pickVerdict, submitBlocker, type Answer, type Verdict } from './logic'

export interface AnswerFormProps {
  answer: Answer
  onChange: (answer: Answer) => void
  sentenceCount: number
  onSubmit: () => void
  pending: boolean
  tryNo: 1 | 2
}

const VERDICTS: readonly { value: Verdict; label: string; icon: LucideIcon }[] = [
  { value: 'flawed', label: 'Flawed', icon: SearchX },
  { value: 'correct', label: 'Correct', icon: CircleCheck },
]

const choiceClass = (checked: boolean) =>
  cn(
    'border-border bg-card cursor-pointer border transition-colors outline-none',
    'hover:border-foreground/30 focus-visible:ring-ring/50 focus-visible:ring-[3px]',
    'has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]',
    checked && 'border-primary bg-primary/5 text-primary hover:border-primary',
  )

/** Verdict → "Which sentence?" → correction (F4c.5). */
export function AnswerForm({
  answer,
  onChange,
  sentenceCount,
  onSubmit,
  pending,
  tryNo,
}: AnswerFormProps) {
  const blocker = submitBlocker(answer)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!blocker && !pending) onSubmit()
  }

  return (
    <form onSubmit={submit} className="space-y-5" aria-labelledby="answer-title">
      <h3 id="answer-title" tabIndex={-1} className="font-medium outline-none">
        {tryNo === 1 ? 'Your answer' : 'Your second try'}
      </h3>

      <fieldset>
        <legend className="text-muted-foreground mb-2 text-sm">
          Does the explanation hold up?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {VERDICTS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className={cn(
                choiceClass(answer.verdict === value),
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 font-medium',
              )}
            >
              <input
                type="radio"
                name="verdict"
                value={value}
                checked={answer.verdict === value}
                onChange={() => onChange(pickVerdict(answer, value))}
                className="sr-only"
              />
              <Icon aria-hidden className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {answer.verdict === 'flawed' && (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Which sentence?</legend>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: sentenceCount }, (_, idx) => (
                <label
                  key={idx}
                  className={cn(
                    choiceClass(answer.flawSentenceIdx === idx),
                    'flex size-9 items-center justify-center rounded-full font-mono text-sm tabular-nums',
                    answer.flawSentenceIdx === idx &&
                      'bg-primary text-primary-foreground hover:bg-primary',
                  )}
                >
                  <input
                    type="radio"
                    name="flaw-sentence"
                    value={idx}
                    checked={answer.flawSentenceIdx === idx}
                    onChange={() => onChange({ ...answer, flawSentenceIdx: idx })}
                    className="sr-only"
                    aria-label={`Sentence ${idx + 1}`}
                  />
                  {idx + 1}
                </label>
              ))}
            </div>
            <p className="text-muted-foreground mt-1.5 text-xs">Or click the sentence itself.</p>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="correction" className="text-sm font-medium">
              What should it say instead?
            </label>
            <Textarea
              id="correction"
              value={answer.correction}
              onChange={(e) => onChange({ ...answer, correction: e.target.value })}
              maxLength={CORRECTION_MAX}
              rows={3}
              placeholder="Rewrite the claim so it's true, and say why."
            />
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={Boolean(blocker) || pending}>
          {pending && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
          {pending ? 'Checking…' : 'Submit'}
        </Button>
        {blocker && <p className="text-muted-foreground text-sm">{blocker}</p>}
        {pending && <p className="text-muted-foreground text-sm">Grading takes a few seconds.</p>}
      </div>
    </form>
  )
}
