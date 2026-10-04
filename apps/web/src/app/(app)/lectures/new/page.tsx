import { FileUp } from 'lucide-react'
import type { Metadata } from 'next'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
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
      {/* TODO(feature-capture-import): source picker (Import recording + .vtt/.srt · Upload
          audio · Upload transcript · Record live if enabled), course picker, consent checkbox
          "I have permission to record or use this lecture." (F1.11), POST /lectures with
          newId(), transcript/audio upload, POST /process, then route to /lectures/{id} or watch.
          Flip FEATURES.addLecture when done so dashboard entry points appear. */}
      <FeaturePlaceholder
        feature="feature-capture-import"
        icon={FileUp}
        title="Add a lecture"
        description="Choose how you want to bring your lecture in."
        className="min-h-72"
      />
    </>
  )
}
