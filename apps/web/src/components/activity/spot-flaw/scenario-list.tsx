'use client'

import { cn } from '@/lib/utils'

export interface ScenarioListProps {
  sentences: readonly string[]
  /** Selected flawed sentence, or null. */
  selected: number | null
  onSelect: (idx: number) => void
  disabled?: boolean
  className?: string
}

/**
 * Numbered scenario sentences (F4c.1). Clicking one is a shortcut for "Flawed + this sentence";
 * the accessible picker is the "Which sentence?" radio group in the answer form.
 */
export function ScenarioList({
  sentences,
  selected,
  onSelect,
  disabled = false,
  className,
}: ScenarioListProps) {
  return (
    <ol aria-label="Scenario" className={cn('space-y-2', className)}>
      {sentences.map((sentence, idx) => {
        const active = selected === idx
        return (
          <li key={idx}>
            <button
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(idx)}
              className={cn(
                'border-border bg-card flex w-full gap-3 rounded-lg border p-3 text-left transition-colors outline-hidden',
                'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background enabled:hover:border-foreground/30',
                active && 'border-primary bg-primary/5 enabled:hover:border-primary',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'bg-sunken text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-medium tabular-nums',
                  active && 'bg-primary text-primary-foreground',
                )}
              >
                {idx + 1}
              </span>
              <span className="leading-relaxed text-pretty">
                <span className="sr-only">Sentence {idx + 1}: </span>
                {sentence}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
