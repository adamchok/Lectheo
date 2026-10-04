import type { Metadata } from 'next'
import { CourseView } from '@/components/course/course-view'

export const metadata: Metadata = { title: 'Concept map' }

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <CourseView courseId={id} />
}
