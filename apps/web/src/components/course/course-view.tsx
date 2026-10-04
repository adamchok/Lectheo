'use client'

import { List, Network } from 'lucide-react'
import { useState } from 'react'
import { pluralize } from '@/client/format'
import { useCourseMap } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
import { LicenseNotice } from '@/components/license-notice'
import { MasteryBar } from '@/components/mastery-bar'
import { countMastery } from '@/components/mastery-meta'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FEATURES } from '@/lib/features'
import { ConceptList } from './concept-list'
import { LectureTimeline } from './lecture-timeline'

type View = 'map' | 'list'

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
  const [view, setView] = useState<View>(FEATURES.conceptMapCanvas ? 'map' : 'list')

  if (map.isPending) return <CourseSkeleton />
  if (map.isError) {
    return (
      <ErrorState title="Couldn't load this course" error={map.error} onRetry={() => map.refetch()} />
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
              onValueChange={(next) => next && setView(next as View)}
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
          {activeView === 'map' ? (
            // TODO(feature-concept-map): React Flow canvas using stored ELK positions
            // (node.position), mastery rings + icon/label, marker overlay, keyboard navigation.
            <FeaturePlaceholder
              feature="feature-concept-map"
              icon={Network}
              title="Concept map"
              description="The interactive map will render here."
              className="min-h-[28rem]"
            />
          ) : (
            <ConceptList map={map.data} />
          )}
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24">
          <LectureTimeline map={map.data} />
          {isLibrary && <LicenseNotice />}
        </aside>
      </div>
    </>
  )
}
