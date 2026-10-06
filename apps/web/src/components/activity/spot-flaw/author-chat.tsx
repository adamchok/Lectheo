'use client'

import type { ActivityResponse } from '@lectheo/contracts'
import { SendHorizontal, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { CharCount, InlineError } from '../shared'

export interface AuthorChatProps {
  messages: ActivityResponse['messages']
  turnsLeft: number
  turnBudget: number
  /** Resolves when the reply arrived; rejects on failure (the draft is restored). */
  onAsk: (text: string) => Promise<unknown>
  pending: boolean
  disabled?: boolean
  /** The last question failed (the draft is restored; shown inline until the next ask). */
  error?: unknown
}

const MAX_CHARS = 2000

/**
 * "Ask the author" (F4c.3): up to 6 questions to the persona who wrote the scenario. Replies are
 * leak-checked server-side before they arrive, so this is plain JSON request/response.
 * The composer is a text input: Enter sends, and global L/I hotkeys ignore it (isBareShortcut).
 */
export function AuthorChat({
  messages,
  turnsLeft,
  turnBudget,
  onAsk,
  pending,
  disabled = false,
  error,
}: AuthorChatProps) {
  const [draft, setDraft] = useState('')
  // The question in flight, shown until the stored copy lands at index `at` (no gap between).
  const [sent, setSent] = useState<{ text: string; at: number } | null>(null)
  const optimistic = sent && messages.length === sent.at ? sent.text : null
  const logRef = useRef<HTMLDivElement>(null)
  const outOfTurns = turnsLeft <= 0
  const blocked = disabled || outOfTurns

  useEffect(() => {
    const log = logRef.current
    if (log) log.scrollTop = log.scrollHeight
  }, [messages.length, pending])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = draft.trim()
    if (!text || pending || blocked) return
    setSent({ text, at: messages.length })
    setDraft('')
    try {
      await onAsk(text)
    } catch {
      setDraft(text)
      setSent(null)
    }
  }

  return (
    <section
      aria-labelledby="author-chat-title"
      className="border-border bg-card rounded-xl border"
    >
      <header className="border-border flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 id="author-chat-title" className="text-heading">
            Ask the author
          </h3>
          <p className="text-caption text-muted-foreground inline-flex items-center gap-1">
            <Sparkles aria-hidden className="size-3.5" />
            AI persona
          </p>
        </div>
        {/* Not live: the log below already announces each reply. */}
        <p className="text-muted-foreground text-body-sm tabular-nums">
          {outOfTurns ? 'No questions left' : `${turnsLeft} of ${turnBudget} questions left`}
        </p>
      </header>

      {/* role="log" announces additions once; index keys keep the optimistic question's node
          when the stored copy replaces it, so it isn't read twice. */}
      <div
        ref={logRef}
        role="log"
        aria-labelledby="author-chat-title"
        className="max-h-80 overflow-y-auto px-4 py-4"
      >
        <ol className="space-y-3">
          {messages.length === 0 && !optimistic && (
            <li className="text-muted-foreground text-sm text-pretty">
              The author wrote this explanation and thinks it&apos;s right. Ask why they wrote
              something, or test a claim with an example.
            </li>
          )}
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} text={m.content} />
          ))}
          {optimistic && <ChatBubble key={messages.length} role="student" text={optimistic} />}
          {pending && (
            <li className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner />
              The author is thinking…
            </li>
          )}
        </ol>
      </div>

      <div className="border-border space-y-2 border-t p-3">
        <form onSubmit={submit} className="flex gap-2">
          <label htmlFor="author-question" className="sr-only">
            Your question for the author
          </label>
          <Input
            id="author-question"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_CHARS}
            autoComplete="off"
            // Not disabled: disabling the focused field drops keyboard focus to <body>.
            readOnly={blocked}
            aria-disabled={blocked || undefined}
            placeholder={outOfTurns ? 'No questions left' : 'Ask about their reasoning…'}
          />
          <Button type="submit" disabled={blocked || pending || draft.trim() === ''}>
            <SendHorizontal aria-hidden />
            <span className="sr-only sm:not-sr-only">Ask</span>
          </Button>
        </form>
        <CharCount length={draft.length} max={MAX_CHARS} />
        {error != null && <InlineError title="The author couldn't answer" error={error} />}
      </div>
    </section>
  )
}

function ChatBubble({ role, text }: { role: 'student' | 'persona'; text: string }) {
  const mine = role === 'student'
  return (
    <li className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed text-pretty whitespace-pre-wrap',
          mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-sunken rounded-bl-sm',
        )}
      >
        <span className="sr-only">{mine ? 'You: ' : 'Author (AI): '}</span>
        {text}
      </div>
    </li>
  )
}
