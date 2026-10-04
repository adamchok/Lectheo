import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { criteriaErrors } from '../common'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { JudgeTeachBackOutput, KEY_POINT_MAX, type JudgeTeachBackInput } from './schema'

/** The rubric view of key points: id, label = text, max 2. Use with gradedCriteria(). */
export function keyPointRubric(input: Pick<JudgeTeachBackInput, 'keyPoints'>) {
  return input.keyPoints.map((k) => ({ id: k.id, label: k.text, max: KEY_POINT_MAX }))
}

export { gradedCriteria } from '../common'

/** Teach-back coverage grading (GPT-6.1 Sol). Totals are computed in code. */
export const judgeTeachBackTask = defineTask<JudgeTeachBackInput, JudgeTeachBackOutput>({
  name: 'judge-teach-back',
  role: 'judge',
  promptVersion: PROMPT_VERSION,
  schema: JudgeTeachBackOutput,
  buildPrompt,
  validate: (out, input) => criteriaErrors(out.criteria, keyPointRubric(input)),
  maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
  fake: (input) => ({
    criteria: input.keyPoints.map((k, i) => ({
      id: k.id,
      score: i === 0 ? KEY_POINT_MAX : 1,
      rationale: i === 0 ? 'Explained clearly.' : 'Mentioned, but vaguely.',
    })),
    misconceptions: [],
    rationale: 'Good start; some key points were only partly covered.',
    guidingQuestion: 'What would go wrong if you never freed that memory?',
  }),
})
