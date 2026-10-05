'use client'

import type { MasteryState } from '@lectheo/contracts'
import { SearchCheck } from 'lucide-react'
import { useStartPractice } from '@/client/practice'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

export interface PracticeButtonProps {
  conceptId: string
  conceptName: string
  /** Current mastery, so the activity can show the before → after change. */
  mastery: MasteryState
}

/** "Practice" on a concept → a new spot-the-flaw activity (F4c entry point). */
export function PracticeButton({ conceptId, conceptName, mastery }: PracticeButtonProps) {
  const { startPractice, isPending } = useStartPractice()
  const onClick = () => startPractice({ conceptId, type: 'spot_flaw', mastery })
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={isPending}
      aria-label={`Practice ${conceptName}: spot the flaw`}
    >
      {isPending ? (
        <Spinner />
      ) : (
        <SearchCheck aria-hidden />
      )}
      {isPending ? 'Preparing…' : 'Practice'}
    </Button>
  )
}
