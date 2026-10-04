import type { RubricSecret } from '@lectheo/contracts'
import { LlmCriteriaGrade } from '../common'

export interface JudgeTransferInput {
  readonly prompt: string
  readonly modelSolution: string
  readonly rubric: RubricSecret
  readonly studentAnswer: string
}

export const JudgeTransferOutput = LlmCriteriaGrade
export type JudgeTransferOutput = LlmCriteriaGrade
