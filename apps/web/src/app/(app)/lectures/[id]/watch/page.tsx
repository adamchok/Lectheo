import type { Metadata } from 'next'
import { WatchView } from '@/components/lecture/watch-view'

export const metadata: Metadata = { title: 'Watch' }

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <WatchView lectureId={id} />
}
