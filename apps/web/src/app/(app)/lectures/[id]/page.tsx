import { Id } from '@lectheo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LectureView } from '@/components/lecture/lecture-view'

export const metadata: Metadata = { title: 'Lecture' }

export default async function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!Id.safeParse(id).success) notFound()
  return <LectureView lectureId={id} />
}
