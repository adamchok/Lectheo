'use client'

import type { ConfidenceLevel } from '@lectheo/contracts'
import { useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { KeyHint } from './key-hint'

export const CONFIDENCE_OPTIONS: ReadonlyArray<{
  value: ConfidenceLevel
  label: string
  hint: string
}> = [
  { value: 'sure', label: 'Sure', hint: "I'd bet on my answer" },
  { value: 'unsure', label: 'Unsure', hint: 'I think I know it' },
  { value: 'guess', label: 'Guessing', hint: "I'd be picking at random" },
  { value: 'no_idea', label: 'No idea', hint: "I haven't got this yet" },
]

/**
 * The level whose 1–4 shortcut is the physical key `code` ("Digit2", "Numpad2"), if any. The
 * caller scopes the listener to its region.
 */
export function confidenceForKey(code: string): ConfidenceLevel | undefined {
  const digit = /^(?:Digit|Numpad)([1-4])$/.exec(code)?.[1]
  return digit ? CONFIDENCE_OPTIONS[Number(digit) - 1]?.value : undefined
}

export interface ConfidencePickerProps {
  value: ConfidenceLevel | undefined
  onChange: (level: ConfidenceLevel) => void
  disabled?: boolean
  /** Show the 1–4 key hints; the caller handles the keys within its region (WCAG 2.1.4). */
  hotkeys?: boolean
  /** Visible label for the group; defaults to the F3.3 prompt. */
  legend?: string
  className?: string
}

/**
 * Confidence rating, asked before answer options are shown (F3.3). Presentational only. Plain
 * buttons, not radios: arrow keys move nothing, so a rating commits only on click/Enter/Space.
 */
export function ConfidencePicker({
  value,
  onChange,
  disabled = false,
  hotkeys = true,
  legend = 'How confident are you?',
  className,
}: ConfidencePickerProps) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={`${id}-legend`} className={cn('space-y-3', className)}>
      <p id={`${id}-legend`} className="text-heading">
        {legend}
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {CONFIDENCE_OPTIONS.map((option, index) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            aria-disabled={disabled || undefined}
            aria-keyshortcuts={hotkeys ? String(index + 1) : undefined}
            onClick={() => !disabled && onChange(option.value)}
            className={cn(
              'border-input bg-card hover:border-primary/50 flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
              // Not colour alone (1.4.1): the chosen one also gets a thicker edge and a check.
              value === option.value && 'border-primary bg-accent ring-primary ring-1',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="text-heading inline-flex items-center gap-1.5">
                  {value === option.value && <Check aria-hidden className="text-primary size-4" />}
                  {option.label}
                </span>
                {hotkeys && <KeyHint aria-hidden>{index + 1}</KeyHint>}
              </span>
              <span className="text-muted-foreground text-caption block">{option.hint}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
