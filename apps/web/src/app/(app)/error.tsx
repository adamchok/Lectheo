'use client'

import { ErrorState } from '@/components/error-state'

/** Render errors inside the shell, so the sidebar stays usable (Design System §4). */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <ErrorState
      className="mx-auto mt-10 max-w-xl"
      title="This page hit a problem"
      description={
        error.digest
          ? `Something went wrong while showing this page. Try again, or go back to Home. Reference ${error.digest}.`
          : 'Something went wrong while showing this page. Try again, or go back to Home.'
      }
      onRetry={reset}
    />
  )
}
