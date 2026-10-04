import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface KeyHintProps {
  children: ReactNode
  /** Accessible name when the key glyph isn't self-explanatory (e.g. "Escape"). */
  label?: string
  className?: string
}

/** Keyboard key, e.g. <KeyHint>L</KeyHint>. */
export function KeyHint({ children, label, className }: KeyHintProps) {
  return (
    <kbd
      aria-label={label}
      className={cn(
        'border-border bg-card text-foreground inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 px-1 font-mono text-[0.6875rem] leading-none font-medium',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
