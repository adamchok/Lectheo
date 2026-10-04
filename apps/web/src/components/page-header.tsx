import { ArrowLeft } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Small label above the title (e.g. "Lecture 5"). */
  eyebrow?: ReactNode
  /** Right-aligned actions (buttons, links). */
  actions?: ReactNode
  back?: { href: Route; label: string }
  className?: string
}

export function PageHeader({ title, description, eyebrow, actions, back, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-8 space-y-3', className)}>
      {back && (
        <Link
          href={back.href}
          className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 rounded px-1 text-sm transition-colors"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {eyebrow && (
            <p className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="font-serif text-3xl leading-tight font-medium tracking-[-0.01em] text-balance">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground max-w-2xl text-[0.9375rem] text-pretty">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
