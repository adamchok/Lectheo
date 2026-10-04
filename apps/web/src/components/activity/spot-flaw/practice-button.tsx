'use client'

import type { MasteryState } from '@lectheo/contracts'
import { LoaderCircle, SearchCheck } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { useStartActivity } from '@/client/queries'
import { Button } from '@/components/ui/button'
import { toastStartError } from './api'

export interface PracticeButtonProps {
  conceptId: string
  conceptName: string
  /** Current mastery, so the activity can show the before → after change. */
  mastery: MasteryState
}

/** "Practice" on a concept → a new spot-the-flaw activity (F4c entry point). */
export function PracticeButton({ conceptId, conceptName, mastery }: PracticeButtonProps) {
  const router = useRouter()
  const start = useStartActivity()
  const onClick = () =>
    start.mutate(
      { conceptId, type: 'spot_flaw' },
      {
        onSuccess: (activity) => router.push(`/activities/${activity.id}?from=${mastery}` as Route),
        onError: toastStartError,
      },
    )
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={start.isPending}
      aria-label={`Practice ${conceptName}: spot the flaw`}
    >
      {start.isPending ? (
        <LoaderCircle aria-hidden className="motion-safe:animate-spin" />
      ) : (
        <SearchCheck aria-hidden />
      )}
      {start.isPending ? 'Preparing…' : 'Practice'}
    </Button>
  )
}
