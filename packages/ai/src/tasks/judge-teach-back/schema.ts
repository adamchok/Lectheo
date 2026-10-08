import type { KeyPoints } from '@lectheo/contracts'
import type { CourseTitles } from '../../prompt'
import { LlmCriteriaGrade } from '../common'

/** Key points are the frozen rubric_snapshot (kind 'key_points'); each scored 0..2. */
export interface JudgeTeachBackInput extends CourseTitles {
  readonly conceptName: string
  readonly keyPoints: KeyPoints
  /** Friend questions (style stripped) and the student's answers, in order. */
  readonly exchanges: readonly { readonly question: string; readonly answer: string }[]
}

export const KEY_POINT_MAX = 2

export const JudgeTeachBackOutput = LlmCriteriaGrade
export type JudgeTeachBackOutput = LlmCriteriaGrade
