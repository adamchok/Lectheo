'use client'

import type { LectureResponse, LectureSource, PipelineStep } from '@lectheo/contracts'
import { ClipboardCheck, Network, Play, RotateCw, Sparkles } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { formatTimestamp, formatTimestampLong, pluralize } from '@/client/format'
import {
  useCourseMap,
  useCourses,
  useLecture,
  useProcessLecture,
  useTranscript,
} from '@/client/queries'
import { DeleteLectureButton } from '@/components/capture/delete-lecture-button'
import { ErrorState, errorMessage } from '@/components/error-state'
import { LectureStatusChip } from '@/components/lecture-status-chip'
import { LicenseNotice } from '@/components/license-notice'
import { MarkerCounts } from '@/components/marker-counts'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'
import { hasMap, LectureModes } from './lecture-modes'
import { isAudio, STEP_LABELS, StepList, stepsFor } from './pipeline-steps'
import { StudyView } from './study-view'

type ReprocessFrom = 'parseTranscript' | 'submitTranscription' | 'extractConcepts' | 'draftItems'

/** Earliest re-runnable step (API `?from=`) that redoes the failed one. */
function retryFrom(step: string, code: string, source: LectureSource): ReprocessFrom {
  // A missing transcript is fixed by reading it again, whichever step noticed.
  if (code === 'no_transcript') return isAudio(source) ? 'submitTranscription' : 'parseTranscript'
  if (['submitTranscription', 'pollTranscription', 'fetchTranscript'].includes(step)) {
    return 'submitTranscription'
  }
  if (['parseTranscript', 'segment', 'buildKeyterms'].includes(step)) {
    return isAudio(source) ? 'submitTranscription' : 'parseTranscript'
  }
  if (step === 'draftItems' || step === 'verifyItems') return 'draftItems'
  return 'extractConcepts'
}

function MapLinks({ lecture }: { lecture: LectureResponse }) {
  return (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={`/courses/${lecture.courseId}` as Route}>
          <Network aria-hidden />
          Concept map
        </Link>
      </Button>
      {lecture.hasTimestamps && (
        <Button asChild variant="outline" size="sm">
          <Link href={`/lectures/${lecture.id}/watch` as Route}>
            <Play aria-hidden />
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
  const processLecture = useProcessLecture()
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
          onClick={() =>
            processLecture.mutate({
              lectureId: lecture.id,
              from: retryFrom(step, lecture.error?.code ?? '', lecture.source),
            })
          }
          disabled={processLecture.isPending}
        >
          {processLecture.isPending ? <Spinner /> : <RotateCw aria-hidden />}
          Retry
        </Button>
      }
    />
  )
}

function DraftPanel({ lecture }: { lecture: LectureResponse }) {
  const processLecture = useProcessLecture()
  const uploading = lecture.status === 'uploading'
  const heading = uploading ? 'Upload may not have finished' : 'Not processed yet'
  const text = uploading
    ? 'If the upload completed, build the map now. If it didn’t, processing stops with a clear error and you can add the lecture again.'
    : 'Once the transcript or recording is uploaded, build the concept map and questions.'
  return (
    <section className="bg-card border-border space-y-3 rounded-xl border p-6">
      <h2 className="font-medium">{heading}</h2>
      <p className="text-muted-foreground text-sm">{text}</p>
      {processLecture.isError && (
        <p className="text-destructive text-sm">{errorMessage(processLecture.error)}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => processLecture.mutate({ lectureId: lecture.id })}
          disabled={processLecture.isPending}
        >
          <Sparkles aria-hidden />
          Build concept map
        </Button>
        {uploading && (
          <Button asChild variant="outline">
            <Link href={'/lectures/new' as Route}>Add lecture again</Link>
          </Button>
        )}
      </div>
    </section>
  )
}

/** This user lecture's concept count once its map exists (null while unknown / not needed). */
function useLectureConceptCount(lecture: LectureResponse | undefined): number | null {
  const needed =
    lecture !== undefined &&
    lecture.source !== 'library' &&
    (lecture.status === 'map_ready' || lecture.status === 'ready')
  const map = useCourseMap(needed ? lecture.courseId : undefined)
  if (!needed || !map.data) return null
  return map.data.nodes.filter((n) => n.lectureIds.includes(lecture.id)).length
}

/** F2.9: say so when a lecture yields few or no concepts, rather than padding the map. */
function ConceptCountNote({ count }: { count: number | null }) {
  if (count === null || count >= 3) return null
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
  // Deep link: /lectures/{id}?t=<ms>#transcript highlights and scrolls to the segment at t.
  const t = Number(useSearchParams().get('t'))
  // Last segment starting at or before t (covers gaps between cues and t = duration).
  const hitIdx =
    Number.isFinite(t) && t > 0 ? segments?.findLast((s) => s.startMs <= t)?.idx : undefined

  useEffect(() => {
    if (hitIdx === undefined) return
    document.getElementById(`s${hitIdx}`)?.scrollIntoView({ block: 'center' })
  }, [hitIdx])

  return (
    <section
      id="transcript"
      aria-labelledby="transcript-heading"
      className="min-w-0 scroll-mt-[calc(var(--topbar-height)+1rem)] space-y-3"
    >
      <h2 id="transcript-heading" className="font-medium">
        Transcript
      </h2>
      {!available && (
        <p className="text-muted-foreground text-sm">
          The transcript appears here once the audio has been transcribed.
        </p>
      )}
      {available && transcript.isPending && (
        <Skeleton label="Loading the transcript" className="h-40 w-full" />
      )}
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
            <li
              key={s.idx}
              id={`s${s.idx}`}
              aria-current={s.idx === hitIdx ? 'true' : undefined}
              className={cn(
                '-mx-2 flex scroll-mt-4 gap-3 rounded-md px-2',
                s.idx === hitIdx && 'bg-accent text-foreground py-1',
              )}
            >
              {lecture.hasTimestamps && (
                <span className="text-muted-foreground w-14 shrink-0 font-mono text-xs tabular-nums">
                  <span aria-hidden>{formatTimestamp(s.startMs)}</span>
                  <span className="sr-only">{formatTimestampLong(s.startMs)}</span>
                </span>
              )}
              <span className="min-w-0 break-words">{s.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function LectureActions({
  lecture,
  conceptCount,
}: {
  lecture: LectureResponse
  conceptCount: number | null
}) {
  // A lecture with no concepts has no map section and no questions (F2.9 empty state instead).
  const empty = conceptCount === 0
  const mapReady = (lecture.status === 'map_ready' || lecture.status === 'ready') && !empty
  return (
    <>
      {(lecture.source === 'import' ||
        (lecture.source === 'library' && lecture.status === 'ready')) && (
        <Button asChild>
          <Link href={`/lectures/${lecture.id}/watch` as Route}>
            <Play aria-hidden />
            Watch
          </Link>
        </Button>
      )}
      {mapReady && (
        <Button asChild variant="outline">
          <Link href={`/courses/${lecture.courseId}` as Route}>
            <Network aria-hidden />
            Concept map
          </Link>
        </Button>
      )}
      {lecture.status === 'ready' && !empty && (
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

const MS_PER_MINUTE = 60_000

/** "8 chapters · 45 min" (F11.5), else the recording's length. */
function LengthMeta({ lecture }: { lecture: LectureResponse }) {
  const media = lecture.media
  const windowMs =
    media?.startMs != null && media.endMs != null ? media.endMs - media.startMs : media?.durationMs
  if (lecture.chapters.length > 0) {
    const minutes = windowMs ? ` · ${Math.round(windowMs / MS_PER_MINUTE)} min` : ''
    return <span>{`${pluralize(lecture.chapters.length, 'chapter')}${minutes}`}</span>
  }
  if (media?.durationMs == null) return null
  return <span className="font-mono text-xs tabular-nums">{formatTimestamp(media.durationMs)}</span>
}

/**
 * /lectures/[id]: Study once the map exists (F9.1), else (or with ?view=transcript, or a ?t= deep
 * link) status, step-by-step processing (2 s polling), errors + retry and the transcript.
 */
export function LectureView({ lectureId }: { lectureId: string }) {
  const lecture = useLecture(lectureId)
  const courses = useCourses()
  const conceptCount = useLectureConceptCount(lecture.data)
  const params = useSearchParams()
  const transcriptAsked = params.get('view') === 'transcript' || params.has('t')

  if (lecture.isPending) {
    return (
      <>
        <PageChrome crumbs={[{ label: 'Lecture' }]} />
        <Skeleton label="Loading lecture" className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-96 max-w-full" />
          <Skeleton className="h-32 w-full" />
        </Skeleton>
      </>
    )
  }
  if (lecture.isError) {
    return (
      <>
        <PageChrome crumbs={[{ label: 'Lecture' }]} />
        <ErrorState
          pageTitle
          title="Couldn't load this lecture"
          error={lecture.error}
          onRetry={() => lecture.refetch()}
        />
      </>
    )
  }

  const data = lecture.data
  const processing = data.status === 'processing' || data.status === 'map_ready'
  const userLecture = data.source !== 'library'
  const courseTitle = courses.data?.find((c) => c.id === data.courseId)?.title ?? 'Course'
  if (hasMap(data) && !transcriptAsked) {
    return <StudyView lecture={data} courseTitle={courseTitle} />
  }

  return (
    <>
      <PageChrome
        crumbs={[
          { label: courseTitle, href: `/courses/${data.courseId}` as Route },
          { label: `Lecture ${data.seq}` },
        ]}
        title={data.title}
        courseId={data.courseId}
        actions={
          <>
            <LectureModes lecture={data} current="transcript" className="max-sm:hidden" />
            {userLecture && <DeleteLectureButton lecture={data} />}
          </>
        }
      />
      <LectureModes lecture={data} current="transcript" className="mb-6 sm:hidden" />
      <PageHeader
        eyebrow={`Lecture ${data.seq}`}
        title={data.title}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <LectureStatusChip status={data.status} />
            <LengthMeta lecture={data} />
            <MarkerCounts lost={data.markerCounts.lost} important={data.markerCounts.important} />
          </span>
        }
        actions={<LectureActions lecture={data} conceptCount={conceptCount} />}
      />

      <div className="space-y-6">
        {processing && <ProcessingPanel lecture={data} />}
        {data.status === 'failed' && <FailedPanel lecture={data} />}
        {userLecture && (data.status === 'draft' || data.status === 'uploading') && (
          <DraftPanel lecture={data} />
        )}
        {userLecture && data.status === 'ready' && <ConceptCountNote count={conceptCount} />}
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
