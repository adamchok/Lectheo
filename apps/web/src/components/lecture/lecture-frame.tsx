'use client'

import type { LectureResponse } from '@lectheo/contracts'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { useCourses, useLecture } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface LectureFrameProps {
  lectureId: string
  /** Eyebrow above the lecture title and the last breadcrumb, e.g. "Watch" or "Diagnostic". */
  section: string
  description?: ReactNode
  /** Shown on the right of the top bar. */
  actions?: (lecture: LectureResponse) => ReactNode
  /** Centre the whole page in a reading column (diagnostic). */
  reading?: boolean
  children: (lecture: LectureResponse) => ReactNode
}

/** Shared lecture-page frame: breadcrumbs, header, body, and the F7.4 notice. */
export function LectureFrame({
  lectureId,
  section,
  description,
  actions,
  reading = false,
  children,
}: LectureFrameProps) {
  const lecture = useLecture(lectureId)
  const courses = useCourses()
  const frame = cn(reading && 'mx-auto max-w-reading')

  if (lecture.isPending) {
    return (
      <>
        <PageChrome crumbs={[{ label: 'Lecture' }]} />
        <Skeleton label="Loading lecture" className={cn('space-y-4', frame)}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-96 max-w-full" />
          <Skeleton className="aspect-video w-full rounded-lg" />
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
  const course = courses.data?.find((c) => c.id === data.courseId)
  return (
    <div className={frame}>
      <PageChrome
        crumbs={[
          { label: course?.title ?? 'Course', href: `/courses/${data.courseId}` as Route },
          { label: `Lecture ${data.seq}`, href: `/lectures/${data.id}` as Route },
          { label: section },
        ]}
        title={`${section} · Lecture ${data.seq}`}
        courseId={data.courseId}
        actions={actions?.(data)}
      />
      <PageHeader
        eyebrow={`Lecture ${data.seq} · ${section}`}
        title={data.title}
        description={description}
      />
      {children(data)}
      {data.source === 'library' && <LicenseNotice className="mt-10" />}
    </div>
  )
}
