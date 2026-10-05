'use client'

import { BookOpen, Network, Plus } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useCourses, useMe } from '@/client/queries'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FEATURES } from '@/lib/features'
import { CourseCard } from './course-card'
import { LectureList } from './lecture-list'
import { NextStepCard } from './next-step-card'

function greeting(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? `Welcome back, ${first}` : 'Welcome back'
}

function DashboardSkeleton() {
  return (
    <div aria-busy aria-label="Loading dashboard" className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-6">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <Skeleton className="h-44 w-full rounded-xl" />
    </div>
  )
}

/** Real product dashboard: next step, lectures, courses (F0.4). No tour, no demo banner. */
export function DashboardView() {
  const me = useMe()
  const courses = useCourses()

  const header = (
    <PageHeader
      title={greeting(me.data?.displayName)}
      description="Pick up where you left off. Your next step is chosen from what you marked and what you got wrong."
      actions={
        FEATURES.addLecture ? (
          <Button asChild variant="outline">
            <Link href="/lectures/new">
              <Plus aria-hidden />
              Add lecture
            </Link>
          </Button>
        ) : null
      }
    />
  )

  if (courses.isPending) {
    return (
      <>
        {header}
        <DashboardSkeleton />
      </>
    )
  }
  if (courses.isError) {
    return (
      <>
        {header}
        <ErrorState title="Couldn't load your courses" error={courses.error} onRetry={() => courses.refetch()} />
      </>
    )
  }

  const list = courses.data
  const primary = list.find((course) => course.kind === 'library') ?? list[0]
  if (!primary) {
    return (
      <>
        {header}
        <EmptyState
          icon={BookOpen}
          title="No courses yet"
          description="Your courses and the CS50 lecture library will appear here."
        />
      </>
    )
  }

  return (
    <>
      {header}
      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          <NextStepCard courseId={primary.id} />
          <section aria-labelledby="lectures-heading" className="bg-card border-border rounded-xl border">
            <div className="border-border flex items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 id="lectures-heading" className="font-medium">
                  Lectures
                </h2>
                <p className="text-muted-foreground text-sm">{primary.title}</p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/courses/${primary.id}` as Route}>
                  <Network aria-hidden />
                  Concept map
                </Link>
              </Button>
            </div>
            <div className="px-5">
              <LectureList courseId={primary.id} />
            </div>
          </section>
        </div>

        <aside aria-labelledby="courses-heading" className="space-y-4">
          <h2 id="courses-heading" className="text-muted-foreground text-xs font-semibold tracking-[0.08em] uppercase">
            Courses
          </h2>
          <ul className="space-y-3">
            {list.map((course) => (
              <li key={course.id}>
                <CourseCard course={course} />
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {list.some((course) => course.kind === 'library') && (
        <footer className="border-border mt-12 border-t pt-6">
          <LicenseNotice />
        </footer>
      )}
    </>
  )
}
