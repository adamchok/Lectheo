'use client'

import { Lightbulb, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface HintLadderProps {
  /** Hint texts revealed in this session (GET /activities doesn't return earlier ones). */
  hints: readonly string[]
  hintsUsed: number
  hintsAvailable: number
  onTake: () => void
  pending: boolean
  disabled?: boolean
}

/** 2-step hint ladder, general then specific (F4c.4). Any hint marks the attempt assisted. */
export function HintLadder({
  hints,
  hintsUsed,
  hintsAvailable,
  onTake,
  pending,
  disabled = false,
}: HintLadderProps) {
  const left = Math.max(hintsAvailable - hintsUsed, 0)
  const earlier = Math.max(hintsUsed - hints.length, 0)
  return (
    <section aria-labelledby="hints-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="hints-title" className="flex items-center gap-1.5 font-medium">
          <Lightbulb aria-hidden className="text-mastery-amber size-4" />
          Hints
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onTake}
          disabled={disabled || pending || left === 0}
        >
          {pending && <LoaderCircle aria-hidden className="motion-safe:animate-spin" />}
          {left === 0 ? 'No hints left' : `Get hint ${hintsUsed + 1} of ${hintsAvailable}`}
        </Button>
      </div>
      {hintsUsed === 0 ? (
        <p className="text-muted-foreground text-sm text-pretty">
          Using a hint marks this attempt as <strong className="font-medium">assisted</strong>: it
          still counts, but not toward Mastered.
        </p>
      ) : (
        <ol className="space-y-2" aria-live="polite">
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
    </section>
  )
}
