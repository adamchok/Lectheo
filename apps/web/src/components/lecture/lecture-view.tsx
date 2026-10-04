'use client'

import type { LectureResponse, LectureSource, PipelineStep } from '@lectheo/contracts'
import {
  Circle,
  CircleCheck,
  ClipboardCheck,
  LoaderCircle,
  Map as MapIcon,
  PlayCircle,
  RotateCw,
  Sparkles,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect } from 'react'
import { formatTimestamp, formatTimestampLong } from '@/client/format'
import { useCourseMap, useLecture, useProcessLecture, useTranscript } from '@/client/queries'
import { ErrorState, errorMessage } from '@/components/error-state'
import { LectureStatusChip } from '@/components/lecture-status-chip'
import { LicenseNotice } from '@/components/license-notice'
import { MarkerCounts } from '@/components/marker-counts'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const STEP_LABELS: Readonly<Record<PipelineStep, string>> = {
  parseTranscript: 'Reading the transcript',
  buildKeyterms: 'Collecting key terms',
  submitTranscription: 'Sending audio for transcription',
  pollTranscription: 'Transcribing audio',
  fetchTranscript: 'Fetching the transcript',
  segment: 'Splitting into segments',
  extractConcepts: 'Finding the concepts',
  validateGraph: 'Checking concept links',
  layoutMap: 'Laying out the map',
  alignMarkers: 'Linking your markers',
  draftItems: 'Writing practice questions',
  verifyItems: 'Verifying questions independently',
}

/** Mirrors server/pipeline/state.ts#pipelinePath (the order the steps run in). */
const MAP_STEPS: readonly PipelineStep[] = [
  'extractConcepts',
  'validateGraph',
  'layoutMap',
  'alignMarkers',
  'draftItems',
  'verifyItems',
]
const isAudio = (source: LectureSource): boolean => source === 'audio' || source === 'live'
const stepsFor = (source: LectureSource): readonly PipelineStep[] =>
  isAudio(source)
    ? ['submitTranscription', 'pollTranscription', 'fetchTranscript', ...MAP_STEPS]
    : ['parseTranscript', ...MAP_STEPS]

type ReprocessFrom = 'parseTranscript' | 'submitTranscription' | 'extractConcepts' | 'draftItems'

/** Earliest re-runnable step (API `?from=`) that redoes the failed one. */
function retryFrom(step: string, source: LectureSource): ReprocessFrom {
  if (['submitTranscription', 'pollTranscription', 'fetchTranscript'].includes(step)) {
    return 'submitTranscription'
  }
  if (['parseTranscript', 'segment', 'buildKeyterms'].includes(step)) {
    return isAudio(source) ? 'submitTranscription' : 'parseTranscript'
  }
  if (step === 'draftItems' || step === 'verifyItems') return 'draftItems'
  return 'extractConcepts'
}

const STEP_STATE_TEXT = { done: '(done)', current: '(in progress)', pending: '(waiting)' } as const

function StepList({ lecture }: { lecture: LectureResponse }) {
  const steps = stepsFor(lecture.source)
  const done = lecture.progress?.done ?? 0
  return (
    <ol className="space-y-2 text-sm">
      {steps.map((step, i) => {
        const state = i < done ? 'done' : i === done ? 'current' : 'pending'
        const Icon = state === 'done' ? CircleCheck : state === 'current' ? LoaderCircle : Circle
        return (
          <li
            key={step}
            className={cn(
              'flex items-center gap-2',
              state === 'pending' && 'text-muted-foreground',
              state === 'current' && 'font-medium',
            )}
          >
            <Icon
              aria-hidden
              className={cn('size-4 shrink-0', state === 'current' && 'animate-spin')}
            />
            <span>{STEP_LABELS[step]}</span>
            <span className="sr-only">{STEP_STATE_TEXT[state]}</span>
          </li>
        )
      })}
    </ol>
  )
}

function MapLinks({ lecture }: { lecture: LectureResponse }) {
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={`/courses/${lecture.courseId}` as Route}>
          <MapIcon aria-hidden />
          Concept map
        </Link>
      </Button>
      {lecture.hasTimestamps && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/lectures/${lecture.id}/watch` as Route}>
            <PlayCircle aria-hidden />
            Watch
          </Link>
        </Button>
      )}
    </>
  )
}

function ProcessingPanel({ lecture }: { lecture: LectureResponse }) {
  const progress = lecture.progress
  const total = progress?.total || stepsFor(lecture.source).length
  const done = progress?.done ?? 0
  const mapReady = lecture.status === 'map_ready'
  const stepLabel = progress?.step ? STEP_LABELS[progress.step] : 'Starting up'
  return (
    <section
      aria-labelledby="processing-heading"
      className="bg-card border-border space-y-4 rounded-xl border p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="processing-heading" className="font-medium">
          {mapReady ? 'Map ready — questions still being prepared' : 'Building your concept map'}
        </h2>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {done}/{total}
        </span>
      </div>
      <Progress value={Math.round((done / total) * 100)} aria-label="Processing progress" />
      <p role="status" aria-live="polite" className="sr-only">
        {stepLabel}
      </p>
      <StepList lecture={lecture} />
      {mapReady && (
        <div className="flex flex-wrap items-center gap-2">
          <MapLinks lecture={lecture} />
          <span className="text-muted-foreground text-sm">
            The diagnostic opens once every question has been checked.
          </span>
        </div>
      )}
    </section>
  )
}

function FailedPanel({ lecture }: { lecture: LectureResponse }) {
  const processLecture = useProcessLecture(lecture.id)
  const step = lecture.error?.step ?? ''
  const label = STEP_LABELS[step as PipelineStep] ?? 'Processing'
  return (
    <ErrorState
      title={`Processing stopped at: ${label}`}
      description={
        <>
          {lecture.error?.message ?? 'Something went wrong while processing this lecture.'}
          {processLecture.isError && (
            <span className="text-destructive mt-2 block">
              {errorMessage(processLecture.error)}
            </span>
          )}
        </>
      }
      action={
        <Button
          onClick={() => processLecture.mutate(retryFrom(step, lecture.source))}
          disabled={processLecture.isPending}
        >
          <RotateCw aria-hidden className={cn(processLecture.isPending && 'animate-spin')} />
          Retry
        </Button>
      }
    />
  )
}

function DraftPanel({ lecture }: { lecture: LectureResponse }) {
  const processLecture = useProcessLecture(lecture.id)
  return (
    <section className="bg-card border-border space-y-3 rounded-xl border p-6">
      <h2 className="font-medium">Not processed yet</h2>
      <p className="text-muted-foreground text-sm">
        Once the transcript or recording is uploaded, build the concept map and questions.
      </p>
      {processLecture.isError && (
        <p className="text-destructive text-sm">{errorMessage(processLecture.error)}</p>
      )}
      <Button onClick={() => processLecture.mutate(undefined)} disabled={processLecture.isPending}>
        <Sparkles aria-hidden />
        Build concept map
      </Button>
    </section>
  )
}

/** F2.9: say so when a lecture yields few or no concepts, rather than padding the map. */
function ConceptCountNote({ lecture }: { lecture: LectureResponse }) {
  const map = useCourseMap(lecture.courseId)
  if (!map.data) return null
  const count = map.data.nodes.filter((n) => n.lectureIds.includes(lecture.id)).length
  if (count >= 3) return null
  const text =
    count === 0
      ? 'We didn’t find teachable concepts in this lecture (it may be an intro or admin session), so nothing was added to the map.'
      : `This lecture added only ${count} concept${count === 1 ? '' : 's'}, so its part of the map is short. Nothing was invented to fill it.`
  return <p className="text-muted-foreground text-sm">{text}</p>
}

function TranscriptPanel({ lecture }: { lecture: LectureResponse }) {
  // Audio lectures have no segments until transcription finishes.
  const available = !isAudio(lecture.source) || ['map_ready', 'ready'].includes(lecture.status)
  const transcript = useTranscript(available ? lecture.id : undefined)
  const segments = transcript.data

  // Deep link: /lectures/{id}?t=<ms>#transcript scrolls to the segment playing at t.
  useEffect(() => {
    if (!segments?.length) return
    const t = Number(new URLSearchParams(window.location.search).get('t'))
    if (!Number.isFinite(t) || t <= 0) return
    const hit = segments.find((s) => s.startMs <= t && t < s.endMs)
    if (hit) document.getElementById(`s${hit.idx}`)?.scrollIntoView({ block: 'center' })
  }, [segments])

  return (
    <section id="transcript" aria-labelledby="transcript-heading" className="space-y-3">
      <h2 id="transcript-heading" className="font-medium">
        Transcript
      </h2>
      {!available && (
        <p className="text-muted-foreground text-sm">
          The transcript appears here once the audio has been transcribed.
        </p>
      )}
      {available && transcript.isPending && <Skeleton className="h-40 w-full" />}
      {transcript.isError && (
        <ErrorState
          title="Couldn't load the transcript"
          error={transcript.error}
          onRetry={() => transcript.refetch()}
        />
      )}
      {segments?.length === 0 && (
        <p className="text-muted-foreground text-sm">This lecture has no transcript yet.</p>
      )}
      {segments && segments.length > 0 && (
        <ol className="border-border max-h-[32rem] space-y-3 overflow-y-auto rounded-xl border p-4 text-sm leading-relaxed">
          {segments.map((s) => (
            <li key={s.idx} id={`s${s.idx}`} className="flex scroll-mt-4 gap-3">
              {lecture.hasTimestamps && (
                <span
                  className="text-muted-foreground w-14 shrink-0 font-mono text-xs tabular-nums"
                  aria-label={formatTimestampLong(s.startMs)}
                >
                  {formatTimestamp(s.startMs)}
                </span>
              )}
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function LectureActions({ lecture }: { lecture: LectureResponse }) {
  const mapReady = lecture.status === 'map_ready' || lecture.status === 'ready'
  return (
    <>
      {lecture.source === 'library' && lecture.status === 'ready' && (
        <Button asChild>
          <Link href={`/lectures/${lecture.id}/watch` as Route}>
            <PlayCircle aria-hidden />
            Watch
          </Link>
        </Button>
      )}
      {mapReady && (
        <Button asChild variant="outline">
          <Link href={`/courses/${lecture.courseId}` as Route}>
            <MapIcon aria-hidden />
            Concept map
          </Link>
        </Button>
      )}
      {lecture.status === 'ready' && (
        <Button asChild variant="outline">
          <Link href={`/lectures/${lecture.id}/diagnostic` as Route}>
            <ClipboardCheck aria-hidden />
            Diagnostic
          </Link>
        </Button>
      )}
    </>
  )
}

/** /lectures/[id]: status, step-by-step processing (2 s polling), errors + retry, transcript. */
export function LectureView({ lectureId }: { lectureId: string }) {
  const lecture = useLecture(lectureId)

  if (lecture.isPending) {
    return (
      <div aria-busy aria-label="Loading lecture" className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (lecture.isError) {
    return (
      <ErrorState
        title="Couldn't load this lecture"
        error={lecture.error}
        onRetry={() => lecture.refetch()}
      />
    )
  }

  const data = lecture.data
  const processing = data.status === 'processing' || data.status === 'map_ready'
  const userLecture = data.source !== 'library'

  return (
    <>
      <PageHeader
        back={{ href: `/courses/${data.courseId}` as Route, label: 'Course' }}
        eyebrow={`Lecture ${data.seq}`}
        title={data.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <LectureStatusChip status={data.status} />
            {data.media?.durationMs != null && (
              <span className="font-mono text-xs tabular-nums">
                {formatTimestamp(data.media.durationMs)}
              </span>
            )}
            <MarkerCounts lost={data.markerCounts.lost} important={data.markerCounts.important} />
          </span>
        }
        actions={<LectureActions lecture={data} />}
      />

      <div className="space-y-6">
        {processing && <ProcessingPanel lecture={data} />}
        {data.status === 'failed' && <FailedPanel lecture={data} />}
        {userLecture && data.status === 'draft' && <DraftPanel lecture={data} />}
        {userLecture && data.status === 'ready' && <ConceptCountNote lecture={data} />}
        {!data.hasTimestamps && data.status !== 'draft' && (
          <p className="text-muted-foreground text-sm">
            This transcript has no timestamps, so the map and diagnostic work but markers are off.
          </p>
        )}
        <TranscriptPanel lecture={data} />
        {data.source === 'library' && <LicenseNotice />}
      </div>
    </>
  )
}
