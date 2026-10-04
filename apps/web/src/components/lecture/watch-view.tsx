'use client'

import { MonitorPlay } from 'lucide-react'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
import { KeyHint } from '@/components/key-hint'
import { LectureFrame } from './lecture-frame'

/** /lectures/[id]/watch — watch mode (F1 mode A/B). */
export function WatchView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Watch"
      description={
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            Press <KeyHint>L</KeyHint> when you&apos;re lost
          </span>
          <span>
            <KeyHint>I</KeyHint> when something&apos;s important
          </span>
        </span>
      }
    >
      {() => (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          {/* TODO(feature-watch-mode): YouTube IFrame player (youtube-nocookie) for library
              lectures / local <video> object URL for imports; useMarkerHotkeys + on-screen
              L / I buttons; marker queue (IndexedDB, POST /markers every 10 s and on pause);
              toast "Marked: lost · Undo" (5 s); counter; wrap in <PlayerProvider> so
              <SourceRef> seeks the player. */}
          <FeaturePlaceholder
            feature="feature-watch-mode"
            icon={MonitorPlay}
            title="Lecture player"
            description="The lecture video will play here."
            className="aspect-video min-h-0"
          />
          {/* TODO(feature-watch-mode): transcript side panel synced to player time. */}
          <FeaturePlaceholder
            feature="feature-watch-mode"
            title="Transcript"
            description="Follow along with the transcript."
            className="hidden min-h-0 lg:flex lg:aspect-[9/16] lg:max-h-[28rem]"
          />
        </div>
      )}
    </LectureFrame>
  )
}
