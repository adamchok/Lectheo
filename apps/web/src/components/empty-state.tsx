import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      {Icon && (
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
          <Icon aria-hidden className="size-5" />
        </span>
      )}
      <div className="max-w-sm space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
