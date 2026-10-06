import { Id } from '@lectheo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CourseView } from '@/components/course/course-view'

export const metadata: Metadata = { title: 'Concept map' }

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!Id.safeParse(id).success) notFound()
  return <CourseView courseId={id} />
}
