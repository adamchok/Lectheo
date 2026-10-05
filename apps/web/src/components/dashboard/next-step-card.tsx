'use client'

import type { NextStepResponse } from '@lectheo/contracts'
import { ArrowRight, Check, ClipboardCheck, Play, Sparkles } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useStartPractice } from '@/client/practice'
import { useNextStep } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ACTIVITY_LABELS } from '@/lib/labels'
import { Spinner } from '@/components/ui/spinner'

const ICONS = {
  watch: Play,
  diagnostic: ClipboardCheck,
  activity: Sparkles,
  none: Check,
} as const

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
    const start = () => startPractice({ conceptId, type: activityType })
    return (
      <Button size="lg" onClick={start} disabled={isPending}>
        {isPending ? (
          <>
            <Spinner />
            Preparing…
          </>
        ) : (
          <>
            Start {ACTIVITY_LABELS[activityType].toLowerCase()}
            <ArrowRight aria-hidden />
          </>
        )}
      </Button>
    )
  }
  return null
}

/** Dashboard "Next step" from the practice recommender (F0.4, Architecture §6.3). */
export function NextStepCard({ courseId }: { courseId: string }) {
  const nextStep = useNextStep(courseId)

  if (nextStep.isPending) {
    return (
      <section aria-label="Next step" aria-busy className="bg-card border-border rounded-2xl border p-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-6 h-7 w-3/4" />
        <Skeleton className="h-10 w-40" />
      </section>
    )
  }
  if (nextStep.isError) {
    return <ErrorState title="Couldn't load your next step" error={nextStep.error} onRetry={() => nextStep.refetch()} />
  }

  const step = nextStep.data
  const Icon = ICONS[step.kind]
  const subject =
    step.kind === 'activity' && step.activityType && step.conceptName
      ? `${ACTIVITY_LABELS[step.activityType]} · ${step.conceptName}`
      : step.conceptName

  return (
    <section
      aria-labelledby="next-step-title"
      className="bg-card border-border relative overflow-hidden rounded-2xl border p-6 sm:p-7"
    >
      <div aria-hidden className="bg-primary absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] uppercase">
            <Icon aria-hidden className="size-4" />
            Next step
          </p>
          <h2 id="next-step-title" className="font-serif text-2xl leading-snug font-medium text-balance">
            {step.reason}
          </h2>
          {subject && <p className="text-muted-foreground text-sm">{subject}</p>}
        </div>
        <NextStepAction step={step} />
      </div>
    </section>
  )
}
