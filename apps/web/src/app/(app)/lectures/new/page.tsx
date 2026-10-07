import type { Metadata } from 'next'
import { NewLectureView } from '@/components/capture/new-lecture-view'
import { PageHeader } from '@/components/page-header'
import { PageChrome } from '@/components/shell/page-chrome'
import { youtubeLecturesEnabled } from '@/server/features'

export const metadata: Metadata = { title: 'New lecture' }
// The F10 switch is read from the environment at request time.
export const dynamic = 'force-dynamic'

export default function NewLecturePage() {
  const youtube = youtubeLecturesEnabled()
  return (
    <>
      <PageChrome crumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'New lecture' }]} />
      <PageHeader
        title="Add a lecture"
        description={
          youtube
            ? 'Import a recording with its transcript, upload audio, paste a transcript, or add a YouTube video.'
            : 'Import a recording with its transcript, upload audio, or paste a transcript.'
        }
      />
      <NewLectureView youtube={youtube} />
    </>
  )
}
