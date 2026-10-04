'use client'

import type { CourseMapResponse } from '@lectheo/contracts'
import { Info, List, Network } from 'lucide-react'
import { useState } from 'react'
import { pluralize } from '@/client/format'
import { useCourseMap } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { LicenseNotice } from '@/components/license-notice'
import { MasteryBar } from '@/components/mastery-bar'
import { countMastery } from '@/components/mastery-meta'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FEATURES } from '@/lib/features'
import { ConceptList } from './concept-list'
import { ConceptMap } from './concept-map'
import { LectureTimeline } from './lecture-timeline'
import { NodePanel } from './node-panel'

type View = 'map' | 'list'

const VIEW_KEY = 'lectheo.courseView'
/** Below this many concepts the map gets an explanatory note (F2.9). */
const SMALL_MAP = 3

function storedView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'map'
  } catch {
    return 'map'
  }
}

function rememberView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Private mode / blocked storage: the toggle still works for this visit.
  }
}

/** Canvas + node panel overlay. Closing the panel returns focus to the node (F2.8). */
function MapView({ map }: { map: CourseMapResponse }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = map.nodes.find((n) => n.id === selectedId)

  if (map.nodes.length === 0) return <ConceptList map={map} />

  const close = () => {
    const id = selectedId
    setSelectedId(null)
    document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)?.focus()
  }

  return (
    <div className="space-y-3">
      {map.nodes.length < SMALL_MAP && (
        <p className="text-muted-foreground flex items-start gap-2 text-sm">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          Only a few concepts so far. Lectures with little conceptual content, like an admin
          session, produce short maps; more appear as you add lectures.
        </p>
      )}
      <div className="relative">
        <ConceptMap map={map} selectedId={selectedId} onOpen={setSelectedId} />
        {selected && (
          <div className="absolute inset-y-3 right-3 flex items-start w-[min(22rem,calc(100%-1.5rem))]">
            <NodePanel concept={selected} map={map} onClose={close} />
          </div>
        )}
      </div>
    </div>
  )
}

function CourseSkeleton() {
  return (
    <div aria-busy aria-label="Loading concept map" className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-2 w-full max-w-md" />
      <div className="space-y-3 pt-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}

/** /courses/[id]: concept map + accessible list view (F2, F2.8). */
export function CourseView({ courseId }: { courseId: string }) {
  const map = useCourseMap(courseId)
  // Safe without a hydration mismatch: the server always renders the skeleton (no prefetch).
  const [view, setView] = useState<View>(() =>
    FEATURES.conceptMapCanvas && typeof window !== 'undefined' ? storedView() : 'list',
  )

  if (map.isPending) return <CourseSkeleton />
  if (map.isError) {
    return (
      <ErrorState
        title="Couldn't load this course"
        error={map.error}
        onRetry={() => map.refetch()}
      />
    )
  }

  const { course, nodes, lectures } = map.data
  const isLibrary = course.kind === 'library'
  const counts = countMastery(nodes.map((node) => node.mastery.state))
  const activeView: View = FEATURES.conceptMapCanvas ? view : 'list'

  return (
    <>
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow={isLibrary ? 'Lecture library' : 'Your course'}
        title={course.title}
        description={`${pluralize(nodes.length, 'concept')} across ${pluralize(lectures.length, 'lecture')}. Flags show where you were lost; stars show what you marked important.`}
        actions={
          FEATURES.conceptMapCanvas ? (
            <ToggleGroup
              type="single"
              variant="outline"
              value={view}
              onValueChange={(next) => {
                if (!next) return
                setView(next as View)
                rememberView(next as View)
              }}
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
          ) : null
        }
      />

      <MasteryBar counts={counts} className="mb-10 max-w-xl" />

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          {activeView === 'map' ? <MapView map={map.data} /> : <ConceptList map={map.data} />}
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24">
          <LectureTimeline map={map.data} />
          {isLibrary && <LicenseNotice />}
        </aside>
      </div>
    </>
  )
}
