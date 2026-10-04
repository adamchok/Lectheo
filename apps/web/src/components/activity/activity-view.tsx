'use client'

import { SearchCheck, Sparkles } from 'lucide-react'
import { useActivity } from '@/client/queries'
import { ErrorState } from '@/components/error-state'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
import { PageHeader } from '@/components/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { ACTIVITY_LABELS } from '@/lib/labels'
import { TeachBackView } from './teach-back/teach-back-view'

/** /activities/[id]: Spot the flaw / Teach-back / Transfer / Stump (F4). */
export function ActivityView({ activityId }: { activityId: string }) {
  const activity = useActivity(activityId)

  if (activity.isPending) {
    return (
      <div aria-busy aria-label="Loading activity" className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-80" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }
  if (activity.isError) {
    return (
      <ErrorState title="Couldn't load this activity" error={activity.error} onRetry={() => activity.refetch()} />
    )
  }

  const data = activity.data
  return (
    <>
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        eyebrow={ACTIVITY_LABELS[data.type]}
        title={data.concept.name}
      />
      <div className="mx-auto max-w-3xl">
        {data.type === 'spot_flaw' ? (
          // TODO(feature-spot-the-flaw): scenario sentences (selectable), author Q&A (≤ 6,
          // POST …/messages JSON), 2-step hints, verdict + flawed sentence + correction submit,
          // Socratic retry, final explanation + rubric with <SourceRef>s, <MasteryBadge> change.
          <FeaturePlaceholder
            feature="feature-spot-the-flaw"
            icon={SearchCheck}
            title="Spot the flaw"
            description="Read a short explanation and decide whether it holds up."
            className="min-h-80"
          />
        ) : data.type === 'teach_back' ? (
          <TeachBackView activity={data} />
        ) : (
          // TODO(feature-transfer / feature-stump): Should-priority activity types.
          <FeaturePlaceholder
            feature={`feature-${data.type}`}
            icon={Sparkles}
            title={ACTIVITY_LABELS[data.type]}
            className="min-h-80"
          />
        )}
      </div>
    </>
  )
}
