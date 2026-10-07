'use client'

import type {
  ActivityType,
  AlsoWorthDoing as AlsoWorthDoingItem,
  EvidenceKind,
  LectureResponse,
  NextStepEvidence,
  NextStepResponse,
} from '@lectheo/contracts'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpenText,
  CircleMinus,
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
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { formatTimestamp, formatTimestampLong } from '@/client/format'
import { useStartPractice } from '@/client/practice'
import { queryKeys, useLecture, useNextStep } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { StepList } from '@/components/lecture/pipeline-steps'
import { MasteryBadge } from '@/components/mastery-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FEATURES } from '@/lib/features'
import { ACTIVITY_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'

const TITLE_ID = 'next-step-title'
const OVERLINE_ID = 'next-step-overline'

const ICONS: Readonly<Record<NextStepResponse['kind'], LucideIcon>> = {
  processing: LoaderCircle,
  study: BookOpenText,
  watch: Play,
  diagnostic: ClipboardCheck,
  activity: Sparkles,
  add_lecture: Plus,
}

/**
 * Evidence icons (Design System §4): flag, star or confident mistake. Wrong and partial use
 * neutral icons: mastery colours and the "Not tested" icon mean mastery states only (§2).
 */
const EVIDENCE_ICONS: Readonly<Record<EvidenceKind, { icon: LucideIcon; className: string }>> = {
  marked_lost: { icon: Flag, className: 'text-marker-lost fill-current' },
  marked_important: { icon: Star, className: 'text-marker-important fill-current' },
  confident_mistake: { icon: TriangleAlert, className: 'text-mastery-red' },
  wrong: { icon: X, className: 'text-muted-foreground' },
  partial: { icon: CircleMinus, className: 'text-muted-foreground' },
}

/** Button labels per activity: product names keep their capitals (Design System §1 voice). */
const START_LABELS: Readonly<Record<ActivityType, string>> = {
  spot_flaw: 'Start Spot the flaw',
  teach_back: 'Start Teach-back',
  transfer: 'Try a Transfer problem',
  stump: 'Start Stump the AI',
}

/**
 * F9.7: Study first ("Study Lecture 5"), Watch second, and a quiet way straight to the
 * diagnostic for a student who already knows the lecture.
 */
function StudyActions({ lectureId }: { lectureId: string }) {
  const lecture = useLecture(lectureId)
  const name = lecture.data ? `Lecture ${lecture.data.seq}` : 'the lecture'
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="lg">
          <Link href={`/lectures/${lectureId}` as Route}>
            Study {name}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/lectures/${lectureId}/watch` as Route}>
            <Play aria-hidden />
            Watch
          </Link>
        </Button>
      </div>
      <Link
        href={`/lectures/${lectureId}/diagnostic` as Route}
        className="text-body-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        Skip to the diagnostic
      </Link>
    </div>
  )
}

function NextStepAction({ step }: { step: NextStepResponse }) {
  const { startPractice, isPending } = useStartPractice()

  if (step.kind === 'study' && step.lectureId) return <StudyActions lectureId={step.lectureId} />
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

/** "▶ 12:41": opens the transcript at the moment; read as a duration, not a clock time. */
function MomentLink({ source }: { source: NonNullable<NextStepEvidence['source']> }) {
  return (
    <Link
      href={`/lectures/${source.lectureId}?t=${source.tMs}#transcript` as Route}
      className="text-primary text-mono hover:bg-accent focus-visible:bg-accent -mx-1 inline-flex items-baseline gap-1 rounded-md px-1 font-medium tabular-nums"
    >
      <Play aria-hidden className="size-3 translate-y-px fill-current" />
      <span aria-hidden>{formatTimestamp(source.tMs)}</span>
      <span className="sr-only">Open transcript at {formatTimestampLong(source.tMs)}</span>
    </Link>
  )
}

function WhyList({ evidence }: { evidence: readonly NextStepEvidence[] }) {
  if (evidence.length === 0) return null
  return (
    <div className="space-y-1">
      <p className="text-caption text-muted-foreground">Why</p>
      <ul role="list" className="text-body-sm space-y-1">
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
  title: string
  children?: ReactNode
  action?: ReactNode
}

/** The one hero on Home: `radius-xl`, a primary edge, action on the right (below when narrow). */
function CardFrame({ icon: Icon, title, children, action }: CardFrameProps) {
  return (
    <section
      aria-labelledby={`${OVERLINE_ID} ${TITLE_ID}`}
      className="bg-card border-border relative overflow-hidden rounded-xl border p-5 sm:p-6"
    >
      <div aria-hidden className="bg-primary absolute inset-y-0 left-0 w-1" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="space-y-2">
            <p id={OVERLINE_ID} className="text-overline text-primary flex items-center gap-1.5">
              <Icon aria-hidden className="size-4" />
              Next step
            </p>
            {/* tabIndex -1: focus lands here when the card changes kind (see NextStep). */}
            <h2 id={TITLE_ID} tabIndex={-1} className="text-title-md text-balance outline-none">
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

const RUNNING = new Set<LectureResponse['status']>(['processing', 'map_ready'])

/** Milestones worth announcing (WCAG 4.1.3), not every pipeline step. */
const MILESTONES: Partial<Record<LectureResponse['status'], string>> = {
  map_ready: 'The concept map is ready. Questions are still being written.',
  failed: 'Processing stopped.',
}

function processingIcon(status: LectureResponse['status'] | undefined): LucideIcon {
  if (status === 'failed') return CircleX
  if (status === 'draft' || status === 'uploading') return Upload
  return LoaderCircle
}

interface ProcessingCardProps {
  step: NextStepResponse
  lectureId: string
  onMilestone: (text: string) => void
}

/** While a lecture processes the card becomes its step list, polled like the lecture page (F0.9). */
function ProcessingCard({ step, lectureId, onMilestone }: ProcessingCardProps) {
  const queryClient = useQueryClient()
  const lecture = useLecture(lectureId)
  const data = lecture.data
  const status = data?.status
  const courseId = data?.courseId

  // useLecture refreshes the next step only on a transition it saw; a lecture that was already
  // ready on first load would leave this card stuck on "being processed".
  const refreshed = useRef(false)
  useEffect(() => {
    if (status !== 'ready' || !courseId || refreshed.current) return
    refreshed.current = true
    void queryClient.invalidateQueries({ queryKey: queryKeys.nextStep(courseId) })
  }, [status, courseId, queryClient])

  useEffect(() => {
    const milestone = status && MILESTONES[status]
    if (milestone) onMilestone(milestone)
  }, [status, onMilestone])

  const mapReady = status === 'map_ready'
  const running = status !== undefined && RUNNING.has(status)
  const action = (
    <div className="flex flex-wrap gap-2">
      {mapReady && courseId && (
        <Button asChild size="lg">
          <Link href={`/courses/${courseId}` as Route}>
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
  const showSteps = data && (running || status === 'failed')
  return (
    <CardFrame icon={processingIcon(status)} title={step.reason} action={action}>
      {!data && (
        <Skeleton
          label="Loading the processing steps"
          className="h-40 w-full max-w-64 rounded-md"
        />
      )}
      {showSteps && <StepList lecture={data} />}
      {running && (
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
        <span className="sr-only"> on {item.conceptName}</span>
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
      <ul role="list" className="divide-border divide-y">
        {items.map((item) => (
          <AlsoWorthDoingRow key={item.conceptId} item={item} />
        ))}
      </ul>
    </section>
  )
}

function NextStepBody({
  step,
  onMilestone,
}: {
  step: NextStepResponse
  onMilestone: (text: string) => void
}) {
  if (step.kind === 'processing' && step.lectureId) {
    return <ProcessingCard step={step} lectureId={step.lectureId} onMilestone={onMilestone} />
  }
  return (
    <div className="space-y-4">
      <NextStepCard step={step} />
      <AlsoWorthDoing items={step.alsoWorthDoing} />
    </div>
  )
}

/**
 * Loads the course's next step (F0.4, Architecture §6.3) into the card. One always-mounted status
 * region announces milestones; when the card changes kind while focus is inside it, focus moves
 * to the new headline instead of dropping to <body>.
 */
export function NextStep({ courseId }: { courseId: string }) {
  const nextStep = useNextStep(courseId)
  const [announcement, setAnnouncement] = useState('')
  const region = useRef<HTMLDivElement>(null)
  const hadFocus = useRef(false)
  const kind = nextStep.data?.kind
  const reason = nextStep.data?.reason
  const lastKind = useRef(kind)

  useEffect(() => {
    const was = lastKind.current
    lastKind.current = kind
    if (!was || !kind || was === kind) return
    if (was === 'processing' && reason) setAnnouncement(reason)
    const active = document.activeElement
    const focusLost = !active || active === document.body
    if (hadFocus.current && focusLost) {
      region.current?.querySelector<HTMLElement>(`#${TITLE_ID}`)?.focus()
    }
  }, [kind, reason])

  let body: ReactNode
  if (nextStep.isPending) {
    body = (
      <Skeleton label="Loading your next step" className="border-border rounded-xl border p-6">
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="mb-6 h-6 w-3/4" />
        <Skeleton className="h-10 w-40" />
      </Skeleton>
    )
  } else if (nextStep.isError) {
    body = (
      <ErrorState
        title="Couldn't load your next step"
        error={nextStep.error}
        onRetry={() => nextStep.refetch()}
      />
    )
  } else {
    body = <NextStepBody step={nextStep.data} onMilestone={setAnnouncement} />
  }

  return (
    <div
      ref={region}
      onFocus={() => {
        hadFocus.current = true
      }}
      onBlur={(e) => {
        // relatedTarget null = focus went nowhere (e.g. the focused node was removed): keep it.
        const next = e.relatedTarget as Node | null
        if (next && !e.currentTarget.contains(next)) hadFocus.current = false
      }}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {body}
    </div>
  )
}
