import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface FeaturePlaceholderProps {
  /** Feature-team tag, e.g. "feature-watch-mode"; emitted as data-feature for grepping. */
  feature: string
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  className?: string
}

/**
 * Calm region reserved for a feature still being built. Contains no controls, so nothing
 * looks broken (Spec §3). Replace it with the real feature UI.
 */
export function FeaturePlaceholder({
  feature,
  icon: Icon,
  title,
  description,
  className,
}: FeaturePlaceholderProps) {
  return (
    <section
      data-feature={feature}
      className={cn(
        'bg-sunken border-border flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center',
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="text-muted-foreground size-5" />}
      <div className="max-w-md space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
      </div>
    </section>
  )
}
