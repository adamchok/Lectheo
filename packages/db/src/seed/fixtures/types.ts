import type { LectureKey } from '../ids'

/** 'mm:ss' or 'h:mm:ss' of media time. */
export type Clock = string

/** One ≤ 40 s transcript segment, paraphrased in lecture voice (not verbatim subtitles). */
export interface SegmentFx {
  idx: number
  at: Clock
  /** Seconds, default 30. */
  dur?: number
  text: string
}

export interface KeyPointFx {
  id: string
  text: string
  segs: number[]
}

export interface ConceptFx {
  key: string
  name: string
  summary: string
  keyPoints: KeyPointFx[]
  /** Occurrence in the concept's own (first) lecture. */
  segs: number[]
  salience: number
}

export interface LectureFx {
  key: LectureKey
  seq: number
  title: string
  youtubeId: string
  /** Core window of the library lecture (F7.1). */
  start: Clock
  end: Clock
  /** Full video length. */
  duration: Clock
  fallbackAudioUrl: string
  segments: SegmentFx[]
  concepts: ConceptFx[]
}

type OptionId = 'a' | 'b' | 'c' | 'd'

export interface McqFx {
  kind: 'diagnostic_mcq'
  concept: string
  variant: number
  segs: number[]
  stem: string
  options: Record<OptionId, string>
  correct: OptionId
  explanation: string
  /** Every wrong option: [misconception, whyWrong]. */
  distractors: Partial<Record<OptionId, [string, string]>>
}

export interface FlawFx {
  kind: 'spot_flaw'
  concept: string
  variant: number
  segs: number[]
  sentences: string[]
  /** null = the scenario is fully correct. */
  flaw: { idx: number; summary: string; correction: string } | null
  explanation: string
  /** Single correction criterion, max 2 (F4c.6). For correct scenarios: the justification. */
  rubric: [label: string, description: string]
  hints: [general: string, specific: string]
  leak: string[]
}

export interface TransferFx {
  kind: 'transfer'
  concept: string
  variant: number
  segs: number[]
  prompt: string
  modelSolution: string
  explanation: string
  /** 2–4 criteria, each max 2: [id, label, description]. */
  rubric: [id: string, label: string, description: string][]
  hints: [general: string, specific: string]
  leak: string[]
}

export type ItemFx = McqFx | FlawFx | TransferFx

export interface EdgeFx {
  from: string
  relation: 'depends_on' | 'is_a' | 'part_of' | 'contrasts_with' | 'causes' | 'example_of'
  to: string
  lecture: LectureKey
  segs: number[]
}

/** A concept that also appears in a later lecture (cross-lecture grounding). */
export interface ExtraOccurrenceFx {
  concept: string
  lecture: LectureKey
  segs: number[]
  salience: number
}
