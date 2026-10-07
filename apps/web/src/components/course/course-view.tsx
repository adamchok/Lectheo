'use client'

import type { CourseMapResponse } from '@lectheo/contracts'
import { Info, List, Network } from 'lucide-react'
import type { Route } from 'next'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { pluralize } from '@/client/format'
import { useCourseMap } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { MasteryBar } from '@/components/mastery-bar'
import { countMastery } from '@/components/mastery-meta'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FEATURES } from '@/lib/features'
import { ConceptList } from './concept-list'
import { CourseActions } from './course-actions'
import { LectureTimeline } from './lecture-timeline'
import { NodePanel } from './node-panel'

// React Flow and its CSS load only when the map view is shown, never for the list.
const ConceptMap = dynamic(() => import('./concept-map').then((m) => m.ConceptMap), {
  ssr: false,
  loading: () => (
    <Skeleton label="Loading your concept map" className="h-[36rem] w-full rounded-lg" />
  ),
})

type View = 'map' | 'list'

const VIEW_KEY = 'lectheo.courseView'
/** Below this many concepts the map gets an explanatory note (F2.9). */
const SMALL_MAP = 3

/** Phones start on the list: a fitted map of 15+ nodes is unreadable at 375px. */
const defaultView = (): View => (window.matchMedia('(min-width: 768px)').matches ? 'map' : 'list')

function storedView(): View {
  try {
    const stored = window.localStorage.getItem(VIEW_KEY)
    return stored === 'list' || stored === 'map' ? stored : defaultView()
  } catch {
    return defaultView()
  }
}

function rememberView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Private mode / blocked storage: the toggle still works for this visit.
  }
}

function SmallMapNote() {
  return (
    <p className="text-body-sm text-muted-foreground flex items-start gap-2">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      Only a few concepts so far. Lectures with little conceptual content, like an admin session,
      produce short maps; more appear as you add lectures.
    </p>
  )
}

function CourseSkeleton() {
  return (
    <Skeleton label="Loading your concept map" className="space-y-6">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="h-7 w-80 max-w-full" />
      <Skeleton className="h-2 w-full max-w-md" />
      <Skeleton className="h-[36rem] w-full rounded-lg" />
    </Skeleton>
  )
}

function ViewToggle({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={view}
      onValueChange={(next) => next && onChange(next as View)}
      aria-label="View"
    >
      <ToggleGroupItem value="map" className="px-3">
        <Network aria-hidden />
        Map
      </ToggleGroupItem>
      <ToggleGroupItem value="list" className="px-3">
        <List aria-hidden />
        List
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** /courses/[id]: concept map + accessible list view (F2, F2.8). */
export function CourseView({ courseId }: { courseId: string }) {
  const map = useCourseMap(courseId)
  // Safe without a hydration mismatch: the server always renders the skeleton (no prefetch).
  const [view, setView] = useState<View>(() =>
    FEATURES.conceptMapCanvas && typeof window !== 'undefined' ? storedView() : 'list',
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (map.isPending) {
    return (
      <>
        <PageChrome crumbs={[{ label: 'Course' }]} />
        <CourseSkeleton />
      </>
    )
  }
  if (map.isError) {
    return (
      <>
        <PageChrome crumbs={[{ label: 'Course' }]} />
        <ErrorState
          pageTitle
          title="Couldn't load this course"
          error={map.error}
          onRetry={() => map.refetch()}
        />
      </>
    )
  }

  const { course, nodes, lectures } = map.data
  const selected = nodes.find((n) => n.id === selectedId)
  const counts = countMastery(nodes.map((node) => node.mastery.state))
  const activeView: View = FEATURES.conceptMapCanvas && nodes.length > 0 ? view : 'list'

  const changeView = (next: View) => {
    setView(next)
    rememberView(next)
  }
  // Closing the panel returns focus to its node (F2.8).
  const closePanel = () => {
    const id = selectedId
    setSelectedId(null)
    document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)?.focus()
  }

  return (
    <>
      <PageChrome
        crumbs={[{ label: course.title, href: `/courses/${course.id}` as Route }]}
        courseId={course.id}
        actions={
          <>
            {/* No concepts means no map: hide the toggle rather than show "Map" over a list. */}
            {FEATURES.conceptMapCanvas && nodes.length > 0 && (
              <ViewToggle view={activeView} onChange={changeView} />
            )}
            {course.kind === 'personal' && <CourseActions course={course} lectures={lectures} />}
          </>
        }
      />
      <PageHeader
        eyebrow={course.kind === 'library' ? 'Lecture library' : 'Your course'}
        title={course.title}
        description={`${pluralize(nodes.length, 'concept')} across ${pluralize(lectures.length, 'lecture')}. Flags show where you were lost; stars show what you marked important.`}
      />

      <MasteryBar counts={counts} className="mb-8 max-w-xl" />

      <div className="space-y-8">
        {activeView === 'map' ? (
          <div className="space-y-3">
            {nodes.length < SMALL_MAP && <SmallMapNote />}
            {/* F2.10: full-width map; the open concept is a sheet over its right side. */}
            <div className="relative">
              <ConceptMap map={map.data} selectedId={selectedId} onOpen={setSelectedId} />
              {selected && (
                <div className="absolute inset-y-3 right-3 max-w-[calc(100%-1.5rem)] w-panel overflow-y-auto rounded-lg shadow-lg">
                  <NodePanel concept={selected} map={map.data} onClose={closePanel} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <ConceptList map={map.data} />
        )}
        <LectureTimeline map={map.data} />
        {course.kind === 'library' && <LicenseNotice />}
      </div>
    </>
  )
}
