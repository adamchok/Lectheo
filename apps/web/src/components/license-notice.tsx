import { cn } from '@/lib/utils'

export const CS50_LICENSE_URL = 'https://cs50.harvard.edu/x/license/'

/** Spec F7.4 — required on every library page. Text is fixed; do not paraphrase. */
export function LicenseNotice({ className }: { className?: string }) {
  return (
    <p className={cn('text-muted-foreground text-xs leading-relaxed', className)}>
      CS50x 2026 by Harvard University,{' '}
      <a
        href={CS50_LICENSE_URL}
        target="_blank"
        rel="noopener noreferrer license"
        className="hover:text-foreground underline decoration-dotted underline-offset-2"
      >
        CC BY-NC-SA 4.0
      </a>
      . Adapted by Lectheo (questions and maps generated). Not affiliated with or endorsed by CS50.
    </p>
  )
}
