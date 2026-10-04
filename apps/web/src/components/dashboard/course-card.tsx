import type { CourseSummary } from '@lectheo/contracts'
import { BookOpen, ChevronRight, FolderOpen } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { pluralize } from '@/client/format'
import { MasteryBar } from '@/components/mastery-bar'

export function CourseCard({ course }: { course: CourseSummary }) {
  const isLibrary = course.kind === 'library'
  const KindIcon = isLibrary ? BookOpen : FolderOpen
  return (
    <Link
      href={`/courses/${course.id}` as Route}
      className="group bg-card border-border hover:border-primary/40 block rounded-xl border p-5 transition-colors"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <KindIcon aria-hidden className="size-3.5" />
            {isLibrary ? 'Lecture library' : 'Your course'} · {pluralize(course.lectureCount, 'lecture')}
          </p>
          <h3 className="truncate font-serif text-lg font-medium">{course.title}</h3>
        </div>
        <ChevronRight
          aria-hidden
          className="text-muted-foreground group-hover:text-foreground mt-1 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
        />
      </div>
      <MasteryBar counts={course.mastery} />
      <span className="sr-only">Open concept map</span>
    </Link>
  )
}
