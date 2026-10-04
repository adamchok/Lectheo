import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import { JUDGE_RULES } from '../common'
import type { JudgeCorrectionInput } from './schema'

export const PROMPT_VERSION = 'judge-correction@0.1'

// TODO(feature-spot-flaw): first draft; calibrate with scripts/eval-judge.ts (≥ 95% agreement).
export const SYSTEM = [
  "You grade a student's correction of a flawed sentence in a CS explanation.",
  JUDGE_RULES,
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: JudgeCorrectionInput): PromptSpec {
  const criteria = input.rubric.criteria
    .map((c) => `- ${c.id} (0..${c.max}) ${c.label}: ${c.description}`)
    .join('\n')
  return {
    system: SYSTEM,
    prompt: [
      untrusted('scenario', input.scenarioSentences.map((s, i) => `${i}. ${s}`).join('\n')),
      `Flawed sentence: ${input.flawSentenceIdx}. What is wrong: ${input.flawSummary}`,
      `Reference correction: ${input.correction}`,
      `Criteria:\n${criteria}`,
      untrusted('student_answer', input.studentCorrection),
    ].join('\n\n'),
  }
}
