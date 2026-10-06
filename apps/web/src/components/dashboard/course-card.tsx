import type { CourseSummary } from '@lectheo/contracts'
import { BookOpen, ChevronRight, FolderOpen } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { pluralize } from '@/client/format'
import { MasteryBar } from '@/components/mastery-bar'

/** One course as a row on Home: kind, title, lecture count and a segmented mastery bar. */
export function CourseRow({ course }: { course: CourseSummary }) {
  const isLibrary = course.kind === 'library'
  const KindIcon = isLibrary ? BookOpen : FolderOpen
  return (
    <Link
      href={`/courses/${course.id}` as Route}
      className="group hover:bg-muted -mx-3 grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 rounded-md px-3 py-4 transition-colors duration-fast sm:grid-cols-[1fr_14rem_auto]"
    >
      <span className="col-start-1 row-start-1 min-w-0 space-y-0.5">
        <span className="text-heading block truncate">{course.title}</span>
        <span className="text-caption text-muted-foreground flex items-center gap-1.5">
          <KindIcon aria-hidden className="size-3.5" />
          {isLibrary ? 'Lecture library' : 'Your course'} ·{' '}
          {pluralize(course.lectureCount, 'lecture')}
        </span>
      </span>
      <MasteryBar
        counts={course.mastery}
        showLegend={false}
        className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1"
      />
      <ChevronRight
        aria-hidden
        className="text-muted-foreground group-hover:text-foreground col-start-2 row-start-1 size-4 shrink-0 sm:col-start-3"
      />
      <span className="sr-only">Open concept map</span>
    </Link>
  )
}
