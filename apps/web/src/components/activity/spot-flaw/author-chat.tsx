'use client'

import type { ActivityResponse } from '@lectheo/contracts'
import { SendHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

export interface AuthorChatProps {
  messages: ActivityResponse['messages']
  turnsLeft: number
  turnBudget: number
  /** Resolves when the reply arrived; rejects on failure (the draft is restored). */
  onAsk: (text: string) => Promise<unknown>
  pending: boolean
  disabled?: boolean
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
}: AuthorChatProps) {
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState<string | null>(null)
  const logRef = useRef<HTMLOListElement>(null)
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
    setSent(text)
    setDraft('')
    try {
      await onAsk(text)
    } catch {
      setDraft(text)
    } finally {
      setSent(null)
    }
  }

  return (
    <section
      aria-labelledby="author-chat-title"
      className="border-border bg-card rounded-xl border"
    >
      <header className="border-border flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <h3 id="author-chat-title" className="font-medium">
          Ask the author
        </h3>
        <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {outOfTurns ? 'No questions left' : `${turnsLeft} of ${turnBudget} questions left`}
        </p>
      </header>

      <ol ref={logRef} aria-live="polite" className="max-h-80 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !sent && (
          <li className="text-muted-foreground text-sm text-pretty">
            The author wrote this explanation and thinks it&apos;s right. Ask why they wrote
            something, or test a claim with an example.
          </li>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={`${m.createdAt}-${i}`} role={m.role} text={m.content} />
        ))}
        {sent && <ChatBubble role="student" text={sent} />}
        {pending && (
          <li className="text-muted-foreground flex items-center gap-2 text-sm">
            <Spinner />
            The author is thinking…
          </li>
        )}
      </ol>

      <form onSubmit={submit} className="border-border flex gap-2 border-t p-3">
        <label htmlFor="author-question" className="sr-only">
          Your question for the author
        </label>
        <Input
          id="author-question"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_CHARS}
          autoComplete="off"
          disabled={blocked}
          placeholder={outOfTurns ? 'No questions left' : 'Ask about their reasoning…'}
        />
        <Button type="submit" disabled={blocked || pending || draft.trim() === ''}>
          <SendHorizontal aria-hidden />
          <span className="sr-only sm:not-sr-only">Ask</span>
        </Button>
      </form>
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
        <span className="sr-only">{mine ? 'You: ' : 'Author: '}</span>
        {text}
      </div>
    </li>
  )
}
