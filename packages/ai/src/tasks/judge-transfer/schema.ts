import type { RubricSecret } from '@lectheo/contracts'
import type { CourseTitles } from '../../prompt'
import { LlmCriteriaGrade } from '../common'

export interface JudgeTransferInput extends CourseTitles {
  readonly prompt: string
  readonly modelSolution: string
  readonly rubric: RubricSecret
  readonly studentAnswer: string
}

export const JudgeTransferOutput = LlmCriteriaGrade
export type JudgeTransferOutput = LlmCriteriaGrade
