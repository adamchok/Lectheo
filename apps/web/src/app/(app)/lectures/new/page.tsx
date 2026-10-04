import type { Metadata } from 'next'
import { NewLectureView } from '@/components/capture/new-lecture-view'
import { PageHeader } from '@/components/page-header'

export const metadata: Metadata = { title: 'Add a lecture' }

export default function NewLecturePage() {
  return (
    <>
      <PageHeader
        back={{ href: '/dashboard', label: 'Dashboard' }}
        title="Add a lecture"
        description="Import a recording with its transcript, upload audio, or paste a transcript."
      />
      <NewLectureView />
    </>
  )
}
