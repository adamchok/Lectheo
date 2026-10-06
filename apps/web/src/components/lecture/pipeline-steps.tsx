import type { LectureResponse, LectureSource, PipelineStep } from '@lectheo/contracts'
import { Check, Circle, CircleX, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* The pipeline as the student sees it: the lecture page and the dashboard card (F0.9). */

export const STEP_LABELS: Readonly<Record<PipelineStep, string>> = {
  parseTranscript: 'Reading the transcript',
  buildKeyterms: 'Collecting key terms',
  submitTranscription: 'Sending audio for transcription',
  pollTranscription: 'Transcribing audio',
  fetchTranscript: 'Fetching the transcript',
  segment: 'Splitting into segments',
  extractConcepts: 'Finding the concepts',
  validateGraph: 'Checking concept links',
  layoutMap: 'Laying out the map',
  alignMarkers: 'Linking your markers',
  draftItems: 'Writing practice questions',
  verifyItems: 'Verifying questions independently',
}

/** Mirrors server/pipeline/state.ts#pipelinePath (the order the steps run in). */
const MAP_STEPS: readonly PipelineStep[] = [
  'extractConcepts',
  'validateGraph',
  'layoutMap',
  'alignMarkers',
  'draftItems',
  'verifyItems',
]
export const isAudio = (source: LectureSource): boolean => source === 'audio' || source === 'live'
export const stepsFor = (source: LectureSource): readonly PipelineStep[] =>
  isAudio(source)
    ? ['submitTranscription', 'pollTranscription', 'fetchTranscript', ...MAP_STEPS]
    : ['parseTranscript', ...MAP_STEPS]

type StepState = 'done' | 'current' | 'pending' | 'failed'

const STEP_STATE_TEXT: Readonly<Record<StepState, string>> = {
  done: '(done)',
  current: '(in progress)',
  pending: '(waiting)',
  failed: '(failed)',
}

const STEP_ICONS = { done: Check, current: LoaderCircle, pending: Circle, failed: CircleX } as const

/** Each step pending, running, done or failed (Design System §4 next-step card). */
export function StepList({ lecture }: { lecture: LectureResponse }) {
  const steps = stepsFor(lecture.source)
  const done = lecture.progress?.done ?? 0
  const failedAt =
    lecture.status === 'failed'
      ? Math.max(0, steps.indexOf(lecture.error?.step as PipelineStep), done)
      : -1
  const stateOf = (i: number): StepState => {
    if (i === failedAt) return 'failed'
    if (i < done) return 'done'
    return i === done && failedAt < 0 ? 'current' : 'pending'
  }
  return (
    // role="list": Safari drops list semantics from styled lists.
    <ol role="list" className="space-y-2 text-sm">
      {steps.map((step, i) => {
        const state = stateOf(i)
        const Icon = STEP_ICONS[state]
        return (
          <li
            key={step}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex items-center gap-2',
              state === 'pending' && 'text-muted-foreground',
              state === 'current' && 'font-medium',
              state === 'failed' && 'text-destructive font-medium',
            )}
          >
            <Icon
              aria-hidden
              className={cn('size-4 shrink-0', state === 'current' && 'motion-safe:animate-spin')}
            />
            <span>{STEP_LABELS[step]}</span>
            <span className="sr-only">{STEP_STATE_TEXT[state]}</span>
          </li>
        )
      })}
    </ol>
  )
}
