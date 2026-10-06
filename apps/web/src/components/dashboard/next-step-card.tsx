'use client'

import type {
  ActivityType,
  AlsoWorthDoing as AlsoWorthDoingItem,
  EvidenceKind,
  NextStepEvidence,
  NextStepResponse,
} from '@lectheo/contracts'
import {
  ArrowRight,
  CircleDashed,
  CircleX,
  ClipboardCheck,
  Flag,
  LoaderCircle,
  Network,
  Play,
  Plus,
  Sparkles,
  Star,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatTimestamp } from '@/client/format'
import { useStartPractice } from '@/client/practice'
import { useLecture, useNextStep } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { StepList } from '@/components/lecture/pipeline-steps'
import { MasteryBadge } from '@/components/mastery-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FEATURES } from '@/lib/features'
import { ACTIVITY_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'

const ICONS: Readonly<Record<NextStepResponse['kind'], LucideIcon>> = {
  processing: LoaderCircle,
  watch: Play,
  diagnostic: ClipboardCheck,
  activity: Sparkles,
  add_lecture: Plus,
}

/** Evidence icons (Design System §4): flag, star or confident mistake. */
const EVIDENCE_ICONS: Readonly<Record<EvidenceKind, { icon: LucideIcon; className: string }>> = {
  marked_lost: { icon: Flag, className: 'text-marker-lost fill-current' },
  marked_important: { icon: Star, className: 'text-marker-important fill-current' },
  confident_mistake: { icon: TriangleAlert, className: 'text-mastery-red' },
  wrong: { icon: CircleX, className: 'text-mastery-red' },
  partial: { icon: CircleDashed, className: 'text-mastery-amber' },
}

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
  if (step.kind === 'add_lecture' && FEATURES.addLecture) {
    return (
      <Button asChild size="lg">
        <Link href="/lectures/new">
          <Plus aria-hidden />
          Add lecture
        </Link>
      </Button>
    )
  }
  return null
}

/** "▶ 12:41": opens the transcript at the moment (same deep link as the map). */
function MomentLink({ source }: { source: NonNullable<NextStepEvidence['source']> }) {
  return (
    <Link
      href={`/lectures/${source.lectureId}?t=${source.tMs}#transcript` as Route}
      className="text-primary hover:bg-accent focus-visible:bg-accent -mx-1 inline-flex items-baseline gap-1 rounded-md px-1 font-mono text-[0.8125rem] font-medium tabular-nums"
    >
      <Play aria-hidden className="size-3 translate-y-px fill-current" />
      <span className="sr-only">Open transcript at </span>
      {formatTimestamp(source.tMs)}
    </Link>
  )
}

function WhyList({ evidence }: { evidence: readonly NextStepEvidence[] }) {
  if (evidence.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-caption text-muted-foreground">Why</p>
      <ul className="text-body-sm space-y-1">
        {evidence.map((e) => {
          const { icon: Icon, className } = EVIDENCE_ICONS[e.kind]
          return (
            <li key={`${e.kind}:${e.text}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Icon aria-hidden className={cn('size-3.5 shrink-0', className)} />
              <span>{e.text}</span>
              {e.source && <MomentLink source={e.source} />}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

const aboutMinutes = (n: number): string => `About ${n} minute${n === 1 ? '' : 's'}`

/** "About 5 minutes · One more independent win → Mastered" */
function CaptionRow({ step }: { step: NextStepResponse }) {
  const parts = [
    step.estimateMinutes === null ? null : aboutMinutes(step.estimateMinutes),
    step.payoff,
  ].filter((p): p is string => Boolean(p))
  if (parts.length === 0) return null
  return <p className="text-caption text-muted-foreground">{parts.join(' · ')}</p>
}

interface CardFrameProps {
  icon: LucideIcon
  spin?: boolean
  title: string
  children?: ReactNode
  action?: ReactNode
}

/** The one hero on Home: `radius-xl`, a primary edge, action on the right (below when narrow). */
function CardFrame({ icon: Icon, spin = false, title, children, action }: CardFrameProps) {
  return (
    <section
      aria-labelledby="next-step-title"
      className="bg-card border-border relative overflow-hidden rounded-xl border p-5 sm:p-6"
    >
      <div aria-hidden className="bg-primary absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="space-y-2">
            <p className="text-overline text-primary flex items-center gap-1.5">
              <Icon aria-hidden className={cn('size-4', spin && 'motion-safe:animate-spin')} />
              Next step
            </p>
            <h2 id="next-step-title" className="text-title-md text-balance">
              {title}
            </h2>
          </div>
          {children}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </section>
  )
}

/**
 * Next-step card (Design System §4, F0.10). Presentational: it renders the
 * GET /courses/{id}/next response as is, so the recommender decides everything shown.
 */
export function NextStepCard({ step }: { step: NextStepResponse }) {
  const subject =
    step.kind === 'activity' && step.activityType && step.conceptName
      ? `${ACTIVITY_LABELS[step.activityType]} · ${step.conceptName}`
      : step.conceptName

  return (
    <CardFrame icon={ICONS[step.kind]} title={step.reason} action={<NextStepAction step={step} />}>
      {subject && <p className="text-body-sm text-muted-foreground">{subject}</p>}
      <WhyList evidence={step.evidence} />
      <CaptionRow step={step} />
    </CardFrame>
  )
}

/** While a lecture processes the card becomes its step list, polled like the lecture page (F0.9). */
function ProcessingCard({ step, lectureId }: { step: NextStepResponse; lectureId: string }) {
  const lecture = useLecture(lectureId)
  const data = lecture.data
  const mapReady = data?.status === 'map_ready'
  const action = (
    <div className="flex flex-wrap gap-2">
      {mapReady && (
        <Button asChild size="lg">
          <Link href={`/courses/${data.courseId}` as Route}>
            <Network aria-hidden />
            Open the map
          </Link>
        </Button>
      )}
      <Button asChild size="lg" variant={mapReady ? 'outline' : 'default'}>
        <Link href={`/lectures/${lectureId}` as Route}>
          Open lecture
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  )
  return (
    <CardFrame
      icon={LoaderCircle}
      spin={data?.status !== 'failed'}
      title={step.reason}
      action={action}
    >
      {data ? (
        <StepList lecture={data} />
      ) : (
        <Skeleton label="Loading the processing steps" className="h-40 w-64 rounded-md" />
      )}
      {data?.status !== 'failed' && (
        <p className="text-caption text-muted-foreground">
          For a 60-minute lecture the map is ready in about 3 minutes and questions in about 8. You
          can leave this page.
        </p>
      )}
    </CardFrame>
  )
}

function AlsoWorthDoingRow({ item }: { item: AlsoWorthDoingItem }) {
  const { startPractice, isPending } = useStartPractice()
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
      <MasteryBadge state={item.state} confidentMistake={item.confidentMistake} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.conceptName}</p>
        <p className="text-body-sm text-muted-foreground">{item.reason}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        pending={isPending}
        pendingLabel="Preparing…"
        onClick={() =>
          startPractice({ conceptId: item.conceptId, type: item.activityType, mastery: item.state })
        }
      >
        {START_LABELS[item.activityType]}
      </Button>
    </li>
  )
}

/** F0.11: the next two ranked concepts. Hidden when there are none. */
function AlsoWorthDoing({ items }: { items: readonly AlsoWorthDoingItem[] }) {
  if (items.length === 0) return null
  return (
    <section aria-labelledby="also-worth-doing" className="px-1">
      <h3 id="also-worth-doing" className="text-overline text-muted-foreground">
        Also worth doing
      </h3>
      <ul className="divide-border divide-y">
        {items.map((item) => (
          <AlsoWorthDoingRow key={item.conceptId} item={item} />
        ))}
      </ul>
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
  const step = nextStep.data
  if (step.kind === 'processing' && step.lectureId) {
    return <ProcessingCard step={step} lectureId={step.lectureId} />
  }
  return (
    <div className="space-y-4">
      <NextStepCard step={step} />
      <AlsoWorthDoing items={step.alsoWorthDoing} />
    </div>
  )
}
