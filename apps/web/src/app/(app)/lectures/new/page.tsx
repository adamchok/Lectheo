import type { Metadata } from 'next'
import { NewLectureView } from '@/components/capture/new-lecture-view'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'

export const metadata: Metadata = { title: 'Add a lecture' }

export default function NewLecturePage() {
  return (
    <>
      <PageChrome crumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'New lecture' }]} />
      <PageHeader
        title="Add a lecture"
        description="Import a recording with its transcript, upload audio, or paste a transcript."
      />
      <NewLectureView />
    </>
  )
}
