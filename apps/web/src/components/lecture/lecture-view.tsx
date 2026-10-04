'use client'

import type { LectureResponse, PipelineStep } from '@lectheo/contracts'
import { ClipboardCheck, FileText, Map as MapIcon, PlayCircle } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { formatTimestamp } from '@/client/format'
import { useLecture } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
import { LectureStatusChip } from '@/components/lecture-status-chip'
import { LicenseNotice } from '@/components/license-notice'
import { MarkerCounts } from '@/components/marker-counts'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

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

function ProcessingPanel({ lecture }: { lecture: LectureResponse }) {
  const progress = lecture.progress
  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const stepLabel = progress?.step ? STEP_LABELS[progress.step] : 'Starting up'
  return (
    <section aria-labelledby="processing-heading" className="bg-card border-border space-y-4 rounded-xl border p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="processing-heading" className="font-medium">
          {lecture.status === 'map_ready' ? 'Map ready · preparing questions' : 'Building your concept map'}
        </h2>
        {progress && (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {progress.done}/{progress.total}
          </span>
        )}
      </div>
      <Progress value={percent} aria-label="Processing progress" />
      <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
        {stepLabel}…
      </p>
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

/** /lectures/[id]: status, processing progress (2 s polling) and transcript. */
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
    return <ErrorState title="Couldn't load this lecture" error={lecture.error} onRetry={() => lecture.refetch()} />
  }

  const data = lecture.data
  const processing = data.status === 'processing' || data.status === 'map_ready'

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
              <span className="font-mono text-xs tabular-nums">{formatTimestamp(data.media.durationMs)}</span>
            )}
            <MarkerCounts lost={data.markerCounts.lost} important={data.markerCounts.important} />
          </span>
        }
        actions={<LectureActions lecture={data} />}
      />

      <div className="space-y-6">
        {processing && <ProcessingPanel lecture={data} />}
        {data.status === 'failed' && (
          <ErrorState
            title="Processing stopped"
            description={data.error?.message ?? 'Something went wrong while processing this lecture.'}
          />
        )}
        {!data.hasTimestamps && data.status !== 'draft' && (
          <p className="text-muted-foreground text-sm">
            This transcript has no timestamps, so the map and diagnostic work but markers are off.
          </p>
        )}
        {/* TODO(feature-processing): transcript panel (GET /lectures/{id}/transcript), deep-link
            to ?t=<ms>#transcript, retry/reprocess for failed lectures, delete lecture. */}
        <FeaturePlaceholder
          feature="feature-processing"
          icon={FileText}
          title="Transcript"
          description="The lecture transcript will appear here."
          className="min-h-40"
        />
        {data.source === 'library' && <LicenseNotice />}
      </div>
    </>
  )
}
