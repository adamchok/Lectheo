'use client'

import { useId, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

/** Visible "required" mark after a label; the field itself carries `required`. */
export function RequiredMark() {
  return (
    <span aria-hidden className="text-destructive">
      *
    </span>
  )
}

/** Joins the ids for `aria-describedby`, skipping unset ones. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  const joined = ids.filter(Boolean).join(' ')
  return joined || undefined
}

export interface SubmitRowProps {
  /** What's still missing, as steps ("add a title"); empty when the form can submit. */
  blockers: readonly string[]
  busy: boolean
  busyLabel: string
  children: ReactNode
}

/**
 * Submit button that stays focusable while it can't run (`aria-disabled`, Design System §3),
 * with the reason beside it. The form's submit handler must check `blockers` and `busy` too.
 */
export function SubmitRow({ blockers, busy, busyLabel, children }: SubmitRowProps) {
  const reasonId = useId()
  const reason = blockers.length > 0 ? `To continue, ${blockers.join(', ')}.` : null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button
        type="submit"
        aria-disabled={reason !== null || busy || undefined}
        aria-describedby={reason ? reasonId : undefined}
        data-pending={busy || undefined}
      >
        {busy ? busyLabel : children}
      </Button>
      {reason && (
        <p id={reasonId} className="text-caption text-muted-foreground">
          {reason}
        </p>
      )}
    </div>
  )
}
