'use client'

import type { CourseMapResponse } from '@lectheo/contracts'
import { ArrowRight, Play, TriangleAlert } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useCourseMap } from '@/client/queries'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LectureStatusChip } from '@/components/lecture-status-chip'
import { countMastery, MASTERY_META } from '@/components/mastery-meta'
import { MasteryBar } from '@/components/mastery-bar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

type MapLecture = CourseMapResponse['lectures'][number]

function lectureAction(lecture: MapLecture, isLibrary: boolean): { href: Route; label: string } {
  if (isLibrary && lecture.status === 'ready') {
    return { href: `/lectures/${lecture.id}/watch` as Route, label: 'Watch' }
  }
  return { href: `/lectures/${lecture.id}` as Route, label: 'Open' }
}

function LectureRow({ lecture, map }: { lecture: MapLecture; map: CourseMapResponse }) {
  const nodes = map.nodes.filter((node) => node.lectureIds.includes(lecture.id))
  const counts = countMastery(nodes.map((node) => node.mastery.state))
  const confidentMistakes = nodes.filter((node) => node.mastery.confidentMistake).length
  const action = lectureAction(lecture, map.course.kind === 'library')

  return (
    <li className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-4 py-4 sm:grid-cols-[3.5rem_1fr_10rem_auto]">
      <span className="text-muted-foreground font-mono text-xs tabular-nums">
        L{String(lecture.seq).padStart(2, '0')}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="truncate font-medium">{lecture.title}</p>
        <div className="flex flex-wrap items-center gap-2">
          <LectureStatusChip
            status={lecture.status}
            label={
              // A ready library lecture with nothing tested yet hasn't been studied (F0.3).
              map.course.kind === 'library' &&
              lecture.status === 'ready' &&
              nodes.length > 0 &&
              counts.gray === nodes.length
                ? 'Ready to watch'
                : undefined
            }
          />
          {confidentMistakes > 0 && (
            <span className="text-mastery-red inline-flex items-center gap-1 text-xs font-medium">
              <TriangleAlert aria-hidden className="size-3.5" />
              {confidentMistakes === 1 ? '1 confident mistake' : `${confidentMistakes} confident mistakes`}
            </span>
          )}
        </div>
      </div>
      <div className="hidden sm:block">
        {nodes.length > 0 && <MasteryBar counts={counts} showLegend={false} />}
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href={action.href}>
          {action.label}
          <span className="sr-only"> {lecture.title}</span>
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </li>
  )
}

/** Lectures of one course with status and per-lecture mastery (F0.4). */
export function LectureList({ courseId }: { courseId: string }) {
  const map = useCourseMap(courseId)

  if (map.isPending) {
    return (
      <div aria-busy aria-label="Loading lectures" className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    )
  }
  if (map.isError) {
    return <ErrorState title="Couldn't load lectures" error={map.error} onRetry={() => map.refetch()} />
  }
  const lectures = [...map.data.lectures].sort((a, b) => a.seq - b.seq)
  if (lectures.length === 0) {
    return (
      <EmptyState
        icon={Play}
        title="No lectures yet"
        description="Lectures you add to this course will show up here."
      />
    )
  }
  return (
    <ul className="divide-border divide-y">
      {lectures.map((lecture) => (
        <LectureRow key={lecture.id} lecture={lecture} map={map.data} />
      ))}
    </ul>
  )
}
