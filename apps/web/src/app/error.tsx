'use client'

import { ErrorState } from '@/components/error-state'

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
      <ErrorState
        className="w-full"
        title="Lectheo hit a problem"
        description={error.digest ? `Please try again. Reference ${error.digest}.` : 'Please try again.'}
        onRetry={reset}
      />
    </main>
  )
}
