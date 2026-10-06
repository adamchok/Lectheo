import { Id } from '@lectheo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ActivityView } from '@/components/activity/activity-view'

export const metadata: Metadata = { title: 'Practice' }

export default async function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!Id.safeParse(id).success) notFound()
  return <ActivityView activityId={id} />
}
