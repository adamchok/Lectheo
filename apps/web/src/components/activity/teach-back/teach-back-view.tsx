'use client'

import type { ActivityResponse, MasterySummary, SubmitResponse } from '@lectheo/contracts'
import { CircleX, SendHorizontal } from 'lucide-react'
import type { ChatStatus } from 'ai'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { isApiClientError } from '@/client/api'
import { useActivity } from '@/client/queries'
import { errorMessage } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { FinalReveal, TryFeedback } from './teach-back-result'
import {
  LOST_THREAD,
  textOf,
  toUiMessages,
  useFinalReplay,
  useSubmitTeachBack,
  useTeachBackChat,
  type TeachBackMessage,
} from './use-teach-back'
import { Spinner } from '@/components/ui/spinner'

// ponytail: one persona (F4a.2); ActivityResponse has no persona, the picker can add it.
const PERSONA = 'Sam'
const MAX_MESSAGE_CHARS = 2000

/** Friendly copy for 409 (turn budget used / closed) and 503 ai_paused (API Spec §1). */
function friendlyError(error: unknown, action: 'reply' | 'grade'): string {
  // Not an API envelope: the stream broke after it started (or the SDK threw).
  if (!isApiClientError(error)) return action === 'reply' ? LOST_THREAD : errorMessage(error)
  if (error.code === 'invalid_state' && action === 'reply') {
    return `You've used all your turns with ${PERSONA}. Submit when you're ready.`
  }
  if (error.code === 'ai_paused') {
    return action === 'reply'
      ? `${PERSONA} can't reply right now: AI is paused for a bit. Your messages are saved, so try again later.`
      : 'Grading is paused for a bit. Your explanation is saved, so try submitting again later.'
  }
  return errorMessage(error)
}

function turnsLeftOf(messages: readonly TeachBackMessage[], fallback: number): number {
  const withMeta = messages.findLast((m) => m.metadata?.turnsLeft !== undefined)
  return withMeta?.metadata?.turnsLeft ?? fallback
}

function Bubble({ message }: { message: TeachBackMessage }) {
  const student = message.role === 'user'
  return (
    <li className={cn('flex', student ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-[0.9375rem] leading-relaxed whitespace-pre-wrap',
          student ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-accent rounded-bl-md',
        )}
      >
        <span className="sr-only">{student ? 'You: ' : `${PERSONA}: `}</span>
        {textOf(message)}
      </div>
    </li>
  )
}

function Transcript({ messages, status }: { messages: TeachBackMessage[]; status: ChatStatus }) {
  const end = useRef<HTMLLIElement>(null)
  const thinking = status === 'submitted'
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' })
  }, [messages, thinking])
  // Announce only the finished reply, not every streamed token.
  const last = messages.at(-1)
  const announcement = status === 'ready' && last?.role === 'assistant' ? textOf(last) : ''
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {announcement && `${PERSONA}: ${announcement}`}
      </p>
      <ol aria-label={`Conversation with ${PERSONA}`} className="space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {thinking && (
          <li className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner />
            {PERSONA} is thinking…
          </li>
        )}
        <li ref={end} aria-hidden />
      </ol>
    </>
  )
}

function Notice({ children }: { children: string }) {
  return (
    <p role="alert" className="text-mastery-red flex items-start gap-2 text-sm">
      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

/** Teach-back (F4a): explain to Sam (≤ 6 turns), submit, one Socratic retry, final reveal. */
export function TeachBackView({ activity }: { activity: ActivityResponse }) {
  const activityQuery = useActivity(activity.id)
  const chat = useTeachBackChat(activity)
  const submit = useSubmitTeachBack(activity.id)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [baseTurnsLeft, setBaseTurnsLeft] = useState(activity.turnBudget - activity.turnsUsed)
  const [tryOne, setTryOne] = useState<SubmitResponse | null>(null)
  const [final, setFinal] = useState<SubmitResponse | null>(null)
  const studentCount = chat.messages.filter((m) => m.role === 'user').length
  // The retry needs new explanation since try 1 (submit.ts treats an unchanged chat as a replay).
  const [countAtTry, setCountAtTry] = useState(studentCount)
  // Text of the in-flight message; restored into the draft if the server never stored it.
  const pending = useRef<string | null>(null)

  const closed = activity.status === 'closed' || final !== null
  const replay = useFinalReplay(activity.id, activity.status === 'closed' && final === null)
  const shownFinal = final ?? replay.data ?? null

  // A failed reply (409 / 503 / network): show copy and resync the chat with the server.
  const { error: chatError, clearError, setMessages } = chat
  const { refetch } = activityQuery
  useEffect(() => {
    if (!chatError) return
    const message = friendlyError(chatError, 'reply')
    clearError()
    const text = pending.current
    pending.current = null
    void refetch().then(({ data }) => {
      setNotice(message)
      const lastStudent = data?.messages.findLast((m) => m.role === 'student')
      if (text && lastStudent?.content !== text) setDraft((d) => d || text)
      if (!data) return
      setMessages(toUiMessages(data.messages))
      setBaseTurnsLeft(data.turnBudget - data.turnsUsed)
    })
  }, [chatError, clearError, refetch, setMessages])

  const turnsLeft = turnsLeftOf(chat.messages, baseTurnsLeft)
  const busy = chat.status === 'submitted' || chat.status === 'streaming'
  const awaitingRetry = tryOne !== null || activity.status === 'awaiting_retry'
  const canSend = !closed && !busy && !submit.isPending && turnsLeft > 0
  const hasNewExplanation = studentCount > countAtTry || turnsLeft === 0
  const canSubmit =
    !closed &&
    !busy &&
    !submit.isPending &&
    studentCount > 0 &&
    (!awaitingRetry || hasNewExplanation)

  const send = (event?: FormEvent) => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || !canSend) return
    setNotice(null)
    setDraft('')
    pending.current = text
    void chat.sendMessage({ text })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) send(event)
  }
  const done = () => {
    setNotice(null)
    submit.mutate(undefined, {
      onSuccess: (result) => {
        if (result.final) return setFinal(result)
        setTryOne(result)
        setCountAtTry(studentCount)
      },
      onError: (error) => setNotice(friendlyError(error, 'grade')),
    })
  }

  const savedQuestion = activity.tries[0]?.feedback.guidingQuestion
  const before: MasterySummary | undefined = tryOne?.mastery

  return (
    <div className="space-y-6">
      {shownFinal ? (
        <FinalReveal
          result={shownFinal}
          before={before}
          courseId={activity.courseId}
          autoFocus={final !== null}
        />
      ) : closed ? (
        <Skeleton label="Loading your result" className="h-64 w-full rounded-2xl" />
      ) : tryOne ? (
        <TryFeedback result={tryOne} />
      ) : (
        awaitingRetry &&
        savedQuestion && (
          <p className="bg-accent rounded-xl p-4 text-[0.9375rem] leading-relaxed">
            <span className="font-medium">Think about this: </span>
            {savedQuestion}
          </p>
        )
      )}

      <section
        aria-label={`Teach ${PERSONA}`}
        className="bg-card border-border overflow-hidden rounded-2xl border"
      >
        <header className="border-border flex items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-full font-serif font-medium"
            >
              S
            </span>
            <div>
              <p className="text-sm font-medium">{PERSONA}</p>
              <p className="text-muted-foreground text-xs">A curious first-year. Teach them!</p>
            </div>
          </div>
          {!closed && (
            <p className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
              {turnsLeft} {turnsLeft === 1 ? 'turn' : 'turns'} left
            </p>
          )}
        </header>

        <div className="max-h-[28rem] overflow-y-auto px-5 py-4">
          <Transcript messages={chat.messages} status={chat.status} />
        </div>

        {!closed && (
          <form onSubmit={send} className="border-border space-y-3 border-t px-5 py-4">
            <label htmlFor="teach-back-input" className="sr-only">
              Your explanation
            </label>
            <div className="flex items-end gap-2">
              <Textarea
                id="teach-back-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                maxLength={MAX_MESSAGE_CHARS}
                // Not disabled while Sam replies (send() waits for canSend): disabling the
                // focused field drops keyboard focus to <body> after every message.
                readOnly={!canSend}
                aria-disabled={!canSend}
                placeholder={
                  turnsLeft > 0
                    ? `Explain it to ${PERSONA} in your own words…`
                    : `That's all of ${PERSONA}'s questions. Submit when you're ready.`
                }
                className="max-h-40 min-h-11 resize-none"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!canSend || !draft.trim()}
                aria-label="Send"
              >
                <SendHorizontal aria-hidden />
              </Button>
            </div>
            {notice && <Notice>{notice}</Notice>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                {submit.isPending
                  ? 'Grading takes a few seconds.'
                  : awaitingRetry && !hasNewExplanation
                    ? `Explain a bit more to ${PERSONA} before your second try.`
                    : 'Enter to send · Shift+Enter for a new line'}
              </p>
              <Button type="button" variant="outline" onClick={done} disabled={!canSubmit}>
                {submit.isPending ? (
                  <>
                    <Spinner />
                    Grading…
                  </>
                ) : awaitingRetry ? (
                  'Submit my second try'
                ) : (
                  "I'm done explaining"
                )}
              </Button>
            </div>
          </form>
        )}
        {closed && replay.isError && (
          <div className="border-border border-t px-5 py-4">
            <Notice>{friendlyError(replay.error, 'grade')}</Notice>
          </div>
        )}
      </section>
    </div>
  )
}
