'use client'

import { ClipboardCheck } from 'lucide-react'
import { FeaturePlaceholder } from '@/components/feature-placeholder'
import { LectureFrame } from './lecture-frame'

/** /lectures/[id]/diagnostic — adaptive, confidence-first diagnostic (F3). */
export function DiagnosticView({ lectureId }: { lectureId: string }) {
  return (
    <LectureFrame
      lectureId={lectureId}
      section="Diagnostic"
      description="A few questions on the ideas you flagged. Rate your confidence first, then pick an answer."
    >
      {() => (
        <div className="mx-auto max-w-3xl">
          {/* TODO(feature-diagnostic): POST /lectures/{id}/diagnostic → per item:
              <ConfidencePicker> → POST …/confidence → options → POST …/answer → instant
              feedback with <SourceRef>, follow-up on sure+wrong (max 2) → GET …/results ordered
              confident mistakes → wrong → unsure-right → right; show `note` when present. */}
          <FeaturePlaceholder
            feature="feature-diagnostic"
            icon={ClipboardCheck}
            title="Diagnostic"
            description="Your questions will appear here, one at a time."
            className="min-h-72"
          />
        </div>
      )}
    </LectureFrame>
  )
}
