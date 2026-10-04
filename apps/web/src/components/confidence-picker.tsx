'use client'

import type { ConfidenceLevel } from '@lectheo/contracts'
import { useEffect, useId, useRef } from 'react'
import { isBareShortcut } from '@/client/keyboard'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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

export interface ConfidencePickerProps {
  value: ConfidenceLevel | undefined
  onChange: (level: ConfidenceLevel) => void
  disabled?: boolean
  /** Number keys 1–4 select an option while no text field has focus. */
  hotkeys?: boolean
  /** Visible legend; defaults to the F3.3 prompt. */
  legend?: string
  className?: string
}

/**
 * Confidence rating, asked before answer options are shown (F3.3). Presentational only.
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
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!hotkeys || disabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.shiftKey || !isBareShortcut(event)) return
      const index = Number.parseInt(event.key, 10) - 1
      const option = CONFIDENCE_OPTIONS[index]
      if (!option) return
      event.preventDefault()
      onChangeRef.current(option.value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [hotkeys, disabled])

  return (
    <fieldset className={cn('space-y-3', className)} disabled={disabled}>
      <legend className="mb-3 text-sm font-medium" id={`${id}-legend`}>
        {legend}
      </legend>
      <RadioGroup
        aria-labelledby={`${id}-legend`}
        value={value ?? ''}
        onValueChange={(next) => onChange(next as ConfidenceLevel)}
        disabled={disabled}
        className="grid grid-cols-2 gap-2 lg:grid-cols-4"
      >
        {CONFIDENCE_OPTIONS.map((option, index) => {
          const itemId = `${id}-${option.value}`
          const selected = value === option.value
          return (
            <label
              key={option.value}
              htmlFor={itemId}
              className={cn(
                'border-border bg-card hover:border-primary/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                'has-[:focus-visible]:ring-ring/60 has-[:focus-visible]:ring-2',
                selected && 'border-primary bg-accent',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <RadioGroupItem id={itemId} value={option.value} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{option.label}</span>
                  {hotkeys && <KeyHint>{index + 1}</KeyHint>}
                </span>
                <span className="text-muted-foreground block text-xs">{option.hint}</span>
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}
