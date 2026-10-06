'use client'

import type { ActivityType, NextStepResponse } from '@lectheo/contracts'
import { ArrowRight, Check, ClipboardCheck, Play, Sparkles } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useStartPractice } from '@/client/practice'
import { useNextStep } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ACTIVITY_LABELS } from '@/lib/labels'

const ICONS = {
  watch: Play,
  diagnostic: ClipboardCheck,
  activity: Sparkles,
  none: Check,
} as const

/** Button labels per activity: product names keep their capitals (Design System §1 voice). */
const START_LABELS: Readonly<Record<ActivityType, string>> = {
  spot_flaw: 'Start Spot the flaw',
  teach_back: 'Start Teach-back',
  transfer: 'Try a Transfer problem',
  stump: 'Start Stump the AI',
}

function NextStepAction({ step }: { step: NextStepResponse }) {
  const { startPractice, isPending } = useStartPractice()

  if (step.kind === 'watch' && step.lectureId) {
    return (
      <Button asChild size="lg">
        <Link href={`/lectures/${step.lectureId}/watch` as Route}>
          Start watching
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    )
  }
  if (step.kind === 'diagnostic' && step.lectureId) {
    return (
      <Button asChild size="lg">
        <Link href={`/lectures/${step.lectureId}/diagnostic` as Route}>
          Start the diagnostic
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    )
  }
  if (step.kind === 'activity' && step.conceptId && step.activityType) {
    const { conceptId, activityType } = step
    return (
      <Button
        size="lg"
        pending={isPending}
        pendingLabel="Preparing…"
        onClick={() => startPractice({ conceptId, type: activityType })}
      >
        {START_LABELS[activityType]}
        <ArrowRight aria-hidden />
      </Button>
    )
  }
  return null
}

/**
 * The one hero on Home (Design System §4 next-step card). Presentational: it takes the
 * GET /courses/{id}/next response as is, so the recommender can change what it returns without
 * touching the page around it.
 */
export function NextStepCard({ step }: { step: NextStepResponse }) {
  const Icon = ICONS[step.kind]
  const subject =
    step.kind === 'activity' && step.activityType && step.conceptName
      ? `${ACTIVITY_LABELS[step.activityType]} · ${step.conceptName}`
      : step.conceptName

  return (
    <section
      aria-labelledby="next-step-title"
      className="bg-card border-border relative overflow-hidden rounded-xl border p-5 sm:p-6"
    >
      <div aria-hidden className="bg-primary absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-overline text-primary flex items-center gap-1.5">
            <Icon aria-hidden className="size-4" />
            Next step
          </p>
          <h2 id="next-step-title" className="text-title-md text-balance">
            {step.reason}
          </h2>
          {subject && <p className="text-body-sm text-muted-foreground">{subject}</p>}
        </div>
        <NextStepAction step={step} />
      </div>
    </section>
  )
}

/** Loads the course's next step (F0.4, Architecture §6.3) into the card. */
export function NextStep({ courseId }: { courseId: string }) {
  const nextStep = useNextStep(courseId)

  if (nextStep.isPending) {
    return (
      <Skeleton label="Loading your next step" className="border-border rounded-xl border p-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-6 h-6 w-3/4" />
        <Skeleton className="h-10 w-40" />
      </Skeleton>
    )
  }
  if (nextStep.isError) {
    return (
      <ErrorState
        title="Couldn't load your next step"
        error={nextStep.error}
        onRetry={() => nextStep.refetch()}
      />
    )
  }
  return <NextStepCard step={nextStep.data} />
}
