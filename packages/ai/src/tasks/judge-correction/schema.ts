import type { RubricSecret } from '@lectheo/contracts'
import type { CourseTitles } from '../../prompt'
import { LlmCriteriaGrade } from '../common'

/** Verdict + location are checked in code (ADR-009); only the correction reaches the judge. */
export interface JudgeCorrectionInput extends CourseTitles {
  readonly scenarioSentences: readonly string[]
  readonly flawSentenceIdx: number
  readonly flawSummary: string
  readonly correction: string
  readonly rubric: RubricSecret
  readonly studentCorrection: string
}

export const JudgeCorrectionOutput = LlmCriteriaGrade
export type JudgeCorrectionOutput = LlmCriteriaGrade
