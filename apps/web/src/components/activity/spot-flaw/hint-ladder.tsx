'use client'

import type { SourceRef } from '@lectheo/contracts'
import { Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { InlineError } from '../shared'
import { Sources } from './result-panel'

export interface HintLadderProps {
  /** Hint texts revealed in this session (GET /activities doesn't return earlier ones). */
  hints: readonly string[]
  /** Lecture grounding of the hints (F5.2); the same for every hint of an activity. */
  sources: readonly SourceRef[]
  hintsUsed: number
  hintsAvailable: number
  onTake: () => void
  pending: boolean
  disabled?: boolean
  /** The last hint request failed (shown inline with "Try again"). */
  error?: unknown
}

/** 2-step hint ladder, general then specific (F4c.4). Any hint marks the attempt assisted. */
export function HintLadder({
  hints,
  sources,
  hintsUsed,
  hintsAvailable,
  onTake,
  pending,
  disabled = false,
  error,
}: HintLadderProps) {
  const left = Math.max(hintsAvailable - hintsUsed, 0)
  const earlier = Math.max(hintsUsed - hints.length, 0)
  const latest = hints.at(-1)
  return (
    <section aria-labelledby="hints-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="hints-title" className="text-heading flex items-center gap-1.5">
          <Lightbulb aria-hidden className="text-mastery-amber size-4" />
          Hints
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onTake}
          disabled={disabled || pending || left === 0}
        >
          {pending && <Spinner />}
          {left === 0 ? 'No hints left' : `Get hint ${hintsUsed + 1} of ${hintsAvailable}`}
        </Button>
      </div>
      {/* Always mounted, so only the newly revealed hint is announced. */}
      <p aria-live="polite" className="sr-only">
        {latest ? `Hint ${earlier + hints.length}: ${latest}` : ''}
      </p>
      {hintsUsed === 0 ? (
        <p className="text-muted-foreground text-body-sm text-pretty">
          Using a hint marks this attempt as <strong className="font-medium">assisted</strong>: it
          still counts, but not toward Mastered.
        </p>
      ) : (
        <ol className="space-y-2">
          {earlier > 0 && (
            <li className="text-muted-foreground text-sm">
              {earlier === 1 ? 'One hint was' : `${earlier} hints were`} used earlier.
            </li>
          )}
          {hints.map((hint, i) => (
            <li
              key={i}
              className="bg-mastery-amber-bg border-mastery-amber/20 rounded-lg border px-3 py-2 text-sm text-pretty"
            >
              <span className="text-mastery-amber mr-1.5 font-medium">Hint {earlier + i + 1}.</span>
              {hint}
            </li>
          ))}
          <li className="text-muted-foreground text-xs">This attempt is marked assisted.</li>
        </ol>
      )}
      {hintsUsed > 0 && <Sources sources={sources} />}
      {error != null && <InlineError title="Couldn't load a hint" error={error} onRetry={onTake} />}
    </section>
  )
}
