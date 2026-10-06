import { Id } from '@lectheo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { WatchView } from '@/components/lecture/watch-view'

export const metadata: Metadata = { title: 'Watch' }

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!Id.safeParse(id).success) notFound()
  return <WatchView lectureId={id} />
}
