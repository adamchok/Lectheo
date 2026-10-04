import type { Metadata } from 'next'
import { LectureView } from '@/components/lecture/lecture-view'

export const metadata: Metadata = { title: 'Lecture' }

export default async function LecturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <LectureView lectureId={id} />
}
