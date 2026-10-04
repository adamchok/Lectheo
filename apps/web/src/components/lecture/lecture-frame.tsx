'use client'

import type { LectureResponse } from '@lectheo/contracts'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { useLecture } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'

export interface LectureFrameProps {
  lectureId: string
  /** Eyebrow above the lecture title, e.g. "Watch" or "Diagnostic". */
  section: string
  description?: ReactNode
  actions?: (lecture: LectureResponse) => ReactNode
  children: (lecture: LectureResponse) => ReactNode
}

/** Shared lecture-page frame: loads the lecture, renders header + body, adds F7.4 notice. */
export function LectureFrame({ lectureId, section, description, actions, children }: LectureFrameProps) {
  const lecture = useLecture(lectureId)

  if (lecture.isPending) {
    return (
      <div aria-busy aria-label="Loading lecture" className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-96 max-w-full" />
        <Skeleton className="aspect-video w-full rounded-xl" />
      </div>
    )
  }
  if (lecture.isError) {
    return <ErrorState title="Couldn't load this lecture" error={lecture.error} onRetry={() => lecture.refetch()} />
  }

  const data = lecture.data
  return (
    <>
      <PageHeader
        back={{ href: `/courses/${data.courseId}` as Route, label: 'Course' }}
        eyebrow={`Lecture ${data.seq} · ${section}`}
        title={data.title}
        description={description}
        actions={actions?.(data)}
      />
      {children(data)}
      {data.source === 'library' && <LicenseNotice className="mt-10" />}
    </>
  )
}
