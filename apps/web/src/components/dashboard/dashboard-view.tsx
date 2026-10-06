'use client'

import type { MasteryState } from '@lectheo/contracts'
import { BookOpen, Network, Plus, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { useCourseMap, useCourses, useMe } from '@/client/queries'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { countMastery, MASTERY_META } from '@/components/mastery-meta'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { FEATURES } from '@/lib/features'
import { cn } from '@/lib/utils'
import { CourseRow } from './course-card'
import { LectureList } from './lecture-list'
import { NextStep } from './next-step-card'

function greeting(displayName: string | null | undefined): string {
  const first = displayName?.trim().split(/\s+/)[0]
  return first ? `Welcome back, ${first}` : 'Welcome back'
}

interface Figure {
  label: string
  value: number
  icon: LucideIcon
  textClass: string
}

const masteryFigure = (state: MasteryState, value: number): Figure => ({
  label: MASTERY_META[state].label,
  value,
  icon: MASTERY_META[state].icon,
  textClass: MASTERY_META[state].textClass,
})

/** Four figures as one card split by hairlines (Design System §4 Home). */
function SummaryRow({ courseId }: { courseId: string }) {
  const map = useCourseMap(courseId)
  if (map.isPending) {
    return <Skeleton label="Loading your progress" className="h-[5.5rem] w-full rounded-lg" />
  }
  if (map.isError) return null // The lecture list below shows the same failure with a retry.

  const counts = countMastery(map.data.nodes.map((node) => node.mastery.state))
  const figures: Figure[] = [
    masteryFigure('green', counts.green),
    masteryFigure('amber', counts.amber),
    masteryFigure('red', counts.red),
    {
      label: 'Confident mistakes',
      value: map.data.nodes.filter((node) => node.mastery.confidentMistake).length,
      icon: TriangleAlert,
      textClass: 'text-mastery-red',
    },
  ]
  return (
    <dl className="bg-card border-border grid grid-cols-2 overflow-hidden rounded-lg border sm:grid-cols-4">
      {figures.map(({ label, value, icon: Icon, textClass }, i) => (
        <div
          key={label}
          className={cn(
            'border-border space-y-1 px-4 py-3 sm:px-5 sm:py-4',
            i % 2 === 0 && 'border-r',
            i < 2 && 'border-b sm:border-b-0',
            i === 1 && 'sm:border-r',
          )}
        >
          <dt className="text-caption text-muted-foreground flex items-center gap-1.5">
            <Icon aria-hidden className={cn('size-3.5', textClass)} />
            {label}
          </dt>
          <dd className="text-title-md tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

interface SectionProps {
  id: string
  title: string
  action?: ReactNode
  children: ReactNode
}

/** Secondary content: a plain section under a hairline, not a nested card. */
function Section({ id, title, action, children }: SectionProps) {
  return (
    <section aria-labelledby={id} className="border-border space-y-2 border-t pt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="text-heading">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Home (F0.4): progress summary, next step, courses, lectures. No tour, no demo banner. */
export function DashboardView() {
  const me = useMe()
  const courses = useCourses()

  const header = (
    <>
      <PageChrome crumbs={[{ label: 'Home' }]} />
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
    </>
  )

  if (courses.isPending) {
    return (
      <>
        {header}
        <Skeleton label="Loading Home" className="space-y-8">
          <Skeleton className="h-[5.5rem] w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </Skeleton>
      </>
    )
  }
  if (courses.isError) {
    return (
      <>
        {header}
        <ErrorState
          title="Couldn't load your courses"
          error={courses.error}
          onRetry={() => courses.refetch()}
        />
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
      <div className="space-y-8">
        <SummaryRow courseId={primary.id} />
        <NextStep courseId={primary.id} />

        <Section id="courses-heading" title="Courses">
          <ul className="divide-border divide-y">
            {list.map((course) => (
              <li key={course.id}>
                <CourseRow course={course} />
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="lectures-heading"
          title={`Lectures · ${primary.title}`}
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${primary.id}` as Route}>
                <Network aria-hidden />
                Concept map
              </Link>
            </Button>
          }
        >
          <LectureList courseId={primary.id} />
        </Section>

        {list.some((course) => course.kind === 'library') && (
          <footer className="border-border border-t pt-6">
            <LicenseNotice />
          </footer>
        )}
      </div>
    </>
  )
}
