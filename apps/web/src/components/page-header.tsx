import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  /** Small label above the title (e.g. "Lecture 5"). */
  eyebrow?: ReactNode
  /** Right-aligned actions; they wrap below the title on narrow screens. */
  actions?: ReactNode
  className?: string
}

/**
 * Page anatomy step 1 (Design System §4): eyebrow, one title-lg h1, a one-line description and
 * actions. No back link: the top bar's breadcrumbs replace it.
 */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow && <p className="text-overline text-muted-foreground">{eyebrow}</p>}
        <h1 className="text-title-lg text-balance break-words">{title}</h1>
        {description && (
          <p className="text-body-sm text-muted-foreground max-w-2xl text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
