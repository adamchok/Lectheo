import type { Metadata } from 'next'
import { ActivityView } from '@/components/activity/activity-view'

export const metadata: Metadata = { title: 'Practice' }

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ActivityView activityId={id} />
}
