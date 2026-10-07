'use client'

import type { BriefResponse, LectureResponse } from '@lectheo/contracts'
import { ClipboardCheck, FileText } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect, useId } from 'react'
import { pluralize } from '@/client/format'
import { useBrief } from '@/client/study'
import { DeleteLectureButton } from '@/components/capture/delete-lecture-button'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LectureModes } from './lecture-modes'
import { StudyConcept } from './study-concept'

/*
 * /lectures/[id] in Study mode (Product Spec F9, Design System §4 "Lecture: Study"): one reading
 * column, concepts in learning order, Test me at the top and the end. No progress tracking (F9.6).
 */

/** "6 concepts · about 5 min to read · 45 min of video · 8 chapters" (F9.5, F11.5). */
function briefCaption(brief: BriefResponse, chapters: number): string {
  return [
    pluralize(brief.concepts.length, 'concept'),
    `about ${Math.max(1, brief.readMinutes)} min to read`,
    brief.videoMinutes ? `${brief.videoMinutes} min of video` : null,
    chapters > 0 ? pluralize(chapters, 'chapter') : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Test me = the diagnostic; shown from map_ready, usable once its questions are checked. */
function TestMe({ lecture }: { lecture: LectureResponse }) {
  const reasonId = useId()
  if (lecture.status === 'ready') {
    return (
      <Button asChild>
        <Link href={`/lectures/${lecture.id}/diagnostic` as Route}>
          <ClipboardCheck aria-hidden />
          Test me
        </Link>
      </Button>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button aria-disabled aria-describedby={reasonId} className="opacity-50">
        <ClipboardCheck aria-hidden />
        Test me
      </Button>
      <span id={reasonId} className="text-caption text-muted-foreground">
        Opens once the questions are ready.
      </span>
    </span>
  )
}

function BriefSkeleton() {
  return (
    <Skeleton label="Loading the study brief" className="space-y-8">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />
          <Skeleton className="h-8 w-56" />
        </div>
      ))}
    </Skeleton>
  )
}

/** /lectures/{id}#concept-{id} (the map's "Read about it"): scroll there once the brief is in. */
function useConceptAnchor(ready: boolean): void {
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.slice(1)
    if (!id.startsWith('concept-')) return
    const block = document.getElementById(id)
    block?.scrollIntoView({ block: 'start' })
    block?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true })
  }, [ready])
}

export interface StudyViewProps {
  lecture: LectureResponse
  courseTitle: string
}

export function StudyView({ lecture, courseTitle }: StudyViewProps) {
  const brief = useBrief(lecture.id)
  useConceptAnchor(Boolean(brief.data))
  const userLecture = lecture.source !== 'library'
  const onPage = new Set(brief.data?.concepts.map((c) => c.id))

  return (
    <div className="max-w-reading mx-auto">
      <PageChrome
        crumbs={[
          { label: courseTitle, href: `/courses/${lecture.courseId}` as Route },
          { label: `Lecture ${lecture.seq}` },
        ]}
        title={`Study · Lecture ${lecture.seq}`}
        courseId={lecture.courseId}
        actions={
          <>
            <LectureModes lecture={lecture} current="study" className="max-sm:hidden" />
            {userLecture && <DeleteLectureButton lecture={lecture} />}
          </>
        }
      />
      <LectureModes lecture={lecture} current="study" className="mb-6 sm:hidden" />
      <PageHeader
        eyebrow={`Lecture ${lecture.seq} · Study`}
        title={lecture.title}
        description={brief.data ? briefCaption(brief.data, lecture.chapters.length) : undefined}
        actions={<TestMe lecture={lecture} />}
      />

      {brief.isPending && <BriefSkeleton />}
      {brief.isError && (
        <ErrorState
          title="Couldn't load the study brief"
          error={brief.error}
          onRetry={() => brief.refetch()}
        />
      )}
      {brief.data?.concepts.length === 0 && (
        <EmptyState
          icon={FileText}
          title="Nothing to study in this lecture"
          description="We didn't find teachable concepts in it, so there's no brief. The transcript is still here."
          action={
            <Button asChild variant="outline">
              <Link href={`/lectures/${lecture.id}?view=transcript` as Route}>
                Open the transcript
              </Link>
            </Button>
          }
        />
      )}
      {brief.data && brief.data.concepts.length > 0 && (
        <>
          <div className="divide-border divide-y">
            {brief.data.concepts.map((c) => (
              <StudyConcept key={c.id} lecture={lecture} concept={c} onPage={onPage} />
            ))}
          </div>
          <section
            aria-label="Test me"
            className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-8"
          >
            <p className="text-title-md text-balance">Ready? Find out what you misunderstood.</p>
            <TestMe lecture={lecture} />
          </section>
        </>
      )}
      {lecture.source === 'library' && <LicenseNotice className="mt-10" />}
    </div>
  )
}
