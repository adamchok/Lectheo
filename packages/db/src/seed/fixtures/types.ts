import type {
  DistractorMeta,
  HintsSecret,
  ItemVerification,
  McqAnswerKey,
  McqPublicPayload,
  RubricSecret,
  SpotFlawAnswerKey,
  SpotFlawPublicPayload,
  TransferAnswerKey,
  TransferPublicPayload,
} from '@lectheo/contracts'
import type { LectureKey } from '../ids'

/** 'mm:ss' or 'h:mm:ss' of media time. */
export type Clock = string

/** One ≤ 40 s transcript segment of the official subtitles, in media (video) time. */
export interface SegmentFx {
  idx: number
  startMs: number
  endMs: number
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
  /** Also the teach-back rubric (F7.3): teach-back snapshots concept.keyPoints. */
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

/**
 * One generated, verified practice item. `publicPayload` becomes `items.public_payload`; every
 * other content field is 🔒 and becomes the `item_secrets` row (ADR-009).
 */
interface ItemBase<K extends string, P, A> {
  concept: string
  kind: K
  variant: number
  segs: number[]
  publicPayload: P
  answerKey: A
  distractorMeta: DistractorMeta | null
  rubric: RubricSecret | null
  hints: HintsSecret | null
  leakKeywords: string[]
  verification: ItemVerification
  /** Gateway slug that drafted the item. */
  model: string
  promptVersion: string
}

export type McqFx = ItemBase<'diagnostic_mcq', McqPublicPayload, McqAnswerKey>
export type FlawFx = ItemBase<'spot_flaw', SpotFlawPublicPayload, SpotFlawAnswerKey>
export type TransferFx = ItemBase<'transfer', TransferPublicPayload, TransferAnswerKey>
export type ItemFx = McqFx | FlawFx | TransferFx

export interface EdgeFx {
  from: string
  relation: 'depends_on' | 'is_a' | 'part_of' | 'contrasts_with' | 'causes' | 'example_of'
  to: string
  lecture: LectureKey
  segs: number[]
}

/** A library chapter (F11): it starts at segment `start` and ends where the next one starts. */
export interface ChapterFx {
  title: string
  summary: string
  start: number
  /** Concept keys the chapter teaches; empty for parts without one. */
  concepts: string[]
}

/** A concept that also appears in a later lecture (cross-lecture grounding). */
export interface ExtraOccurrenceFx {
  concept: string
  lecture: LectureKey
  segs: number[]
  salience: number
}
