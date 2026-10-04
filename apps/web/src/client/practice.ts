'use client'

import type { ActivityType, MasteryState } from '@lectheo/contracts'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { errorMessage } from '@/components/error-state'
import { isApiClientError } from './api'
import { useStartActivity } from './queries'

/**
 * Toast for POST /activities failures. 409 means the bank has nothing new for this concept: that's
 * news, not an error.
 */
export function toastStartError(error: unknown): void {
  if (isApiClientError(error) && error.status === 409) {
    toast.info("You've done every practice item for this concept", {
      description: 'New ones are on the way. Try another activity or concept meanwhile.',
    })
    return
  }
  toast.error("Couldn't start the activity", { description: errorMessage(error) })
}

export interface StartPracticeInput {
  conceptId: string
  type: ActivityType
  /** Mastery before the activity, so it can show the before → after change (?from=). */
  mastery?: MasteryState
}

/** Starts a practice activity and opens it; failures (incl. 409 "nothing new") become toasts. */
export function useStartPractice() {
  const router = useRouter()
  const start = useStartActivity()
  const startPractice = ({ conceptId, type, mastery }: StartPracticeInput) =>
    start.mutate(
      { conceptId, type },
      {
        onSuccess: (activity) => {
          const from = mastery ? `?from=${mastery}` : ''
          router.push(`/activities/${activity.id}${from}` as Route)
        },
        onError: toastStartError,
      },
    )
  return { startPractice, isPending: start.isPending }
}
