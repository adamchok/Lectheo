'use client'

import { Sparkles } from 'lucide-react'
import dynamic from 'next/dynamic'
import type { Route } from 'next'
import { useActivity, useCourses } from '@/client/queries'
import { SpotFlawView } from '@/components/activity/spot-flaw/spot-flaw-view'
import { ErrorState } from '@/components/error-state'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
import { LicenseNotice } from '@/components/license-notice'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { Skeleton } from '@/components/ui/skeleton'
import { ACTIVITY_LABELS } from '@/lib/labels'
import { StumpView } from './stump/stump-view'
import { TransferView } from './transfer/transfer-view'

// The AI SDK chat client (~56 kB) is only needed by teach-back: keep it off the other activities.
const TeachBackView = dynamic(
  () => import('./teach-back/teach-back-view').then((m) => m.TeachBackView),
  { loading: () => <Skeleton label="Loading Teach-back" className="h-64 w-full rounded-lg" /> },
)

/** /activities/[id]: Spot the flaw / Teach-back / Transfer / Stump (F4). */
export function ActivityView({ activityId }: { activityId: string }) {
  const activity = useActivity(activityId)
  const courses = useCourses()

  if (activity.isPending) {
    return (
      <Skeleton label="Loading activity" className="mx-auto max-w-reading space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-80 max-w-full" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </Skeleton>
    )
  }
  if (activity.isError) {
    return (
      <ErrorState
        title="Couldn't load this activity"
        error={activity.error}
        onRetry={() => activity.refetch()}
      />
    )
  }

  const data = activity.data
  const course = courses.data?.find((c) => c.id === data.courseId)
  const label = ACTIVITY_LABELS[data.type]
  return (
    <div className="mx-auto max-w-reading">
      <PageChrome
        crumbs={[
          { label: course?.title ?? 'Course', href: `/courses/${data.courseId}` as Route },
          { label: `${label} · ${data.concept.name}` },
        ]}
        courseId={data.courseId}
      />
      <PageHeader eyebrow={label} title={data.concept.name} />
      <div>
        {data.type === 'spot_flaw' ? (
          <SpotFlawView activity={data} />
        ) : data.type === 'teach_back' ? (
          <TeachBackView activity={data} />
        ) : data.type === 'transfer' ? (
          <TransferView activity={data} />
        ) : data.type === 'stump' ? (
          <StumpView activity={data} />
        ) : (
          <FeaturePlaceholder
            feature={`feature-${data.type}`}
            icon={Sparkles}
            title={ACTIVITY_LABELS[data.type]}
            className="min-h-80"
          />
        )}
        {data.courseKind === 'library' && <LicenseNotice className="mt-10" />}
      </div>
    </div>
  )
}
