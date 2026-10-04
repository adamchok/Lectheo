'use client'

import { ErrorState } from '@/components/error-state'

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
          ? `Something went wrong while showing this page. Reference ${error.digest}.`
          : 'Something went wrong while showing this page.'
      }
      onRetry={reset}
    />
  )
}
