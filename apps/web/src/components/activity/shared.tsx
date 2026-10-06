'use client'

import { CircleX, RotateCw, Sparkles } from 'lucide-react'
import { errorMessage } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Counters appear from 80 % of a limit (Design System §3 Forms). */
const COUNTER_FROM = 0.8

export function CharCount({ length, max, id }: { length: number; max: number; id?: string }) {
  if (length < max * COUNTER_FROM) return null
  return (
    <span id={id} className="text-caption text-muted-foreground tabular-nums">
      {length}/{max}
    </span>
  )
}

export interface InlineErrorProps {
  title: string
  error: unknown
  /** Offered when repeating the same request can fix it. */
  onRetry?: () => void
  className?: string
}

/** An error that needs action, next to what failed; stays until resolved (Design System §3). */
export function InlineError({ title, error, onRetry, className }: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={cn('text-destructive flex flex-wrap items-start gap-2 text-body-sm', className)}
    >
      <CircleX aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{title}.</span> {errorMessage(error)}
      </p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      )}
    </div>
  )
}

/** Graded results name their judge (Design System §1 Voice). */
export function JudgeNote({ className }: { className?: string }) {
  return (
    <p className={cn('text-caption text-muted-foreground flex items-center gap-1.5', className)}>
      <Sparkles aria-hidden className="size-3.5" />
      Checked by a separate judge
    </p>
  )
}
