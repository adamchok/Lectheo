import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import { JUDGE_RULES } from '../common'
import type { JudgeTransferInput } from './schema'

export const PROMPT_VERSION = 'judge-transfer@0.1'

// TODO(feature-transfer): first draft (Should). Calibrate with scripts/eval-judge.ts.
export const SYSTEM = [
  "You grade a student's answer to a CS transfer problem against a rubric and a model solution.",
  'Accept any correct approach, not only the model solution.',
  JUDGE_RULES,
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: JudgeTransferInput): PromptSpec {
  const criteria = input.rubric.criteria
    .map((c) => `- ${c.id} (0..${c.max}) ${c.label}: ${c.description}`)
    .join('\n')
  return {
    system: SYSTEM,
    prompt: [
      `Problem: ${input.prompt}`,
      `Model solution: ${input.modelSolution}`,
      `Criteria:\n${criteria}`,
      untrusted('student_answer', input.studentAnswer),
    ].join('\n\n'),
  }
}
