import { cn } from '@/lib/utils'

/** Lens mark: theōria, "seeing" — an open circle with an off-centre focal point. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-6', className)} fill="none">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="2" />
      <circle cx="14.25" cy="9.75" r="3.25" fill="currentColor" />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-foreground inline-flex items-center gap-2', className)}>
      <LogoMark className="text-primary" />
      <span className="font-serif text-xl font-semibold tracking-[-0.01em]">Lectheo</span>
    </span>
  )
}
