import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import { JUDGE_RULES } from '../common'
import { KEY_POINT_MAX, type JudgeTeachBackInput } from './schema'

export const PROMPT_VERSION = 'judge-teach-back@0.1'

// TODO(feature-teach-back): first draft; calibrate with scripts/eval-judge.ts.
export const SYSTEM = [
  "A student explained a CS concept to a confused classmate. Score how well the student's",
  `answers covered each key point: 0 = missing or wrong, 1 = partial or vague, ${KEY_POINT_MAX} =`,
  'clear and correct. Use the key point id as the criterion id. List any misconceptions stated.',
  JUDGE_RULES,
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: JudgeTeachBackInput): PromptSpec {
  const points = input.keyPoints.map((k) => `- ${k.id}: ${k.text}`).join('\n')
  const dialogue = input.exchanges
    .map((e, i) => `Q${i + 1}: ${e.question}\n${untrusted('student_answer', e.answer)}`)
    .join('\n\n')
  return {
    system: SYSTEM,
    prompt: `Concept: ${input.conceptName}\n\nKey points:\n${points}\n\n${dialogue}`,
  }
}
