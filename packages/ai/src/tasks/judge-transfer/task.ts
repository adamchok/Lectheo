import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { criteriaErrors } from '../common'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { JudgeTransferOutput, type JudgeTransferInput } from './schema'

export { gradedCriteria } from '../common'

/** Transfer problem grading (Should). */
export const judgeTransferTask = defineTask<JudgeTransferInput, JudgeTransferOutput>({
  name: 'judge-transfer',
  role: 'judge',
  promptVersion: PROMPT_VERSION,
  schema: JudgeTransferOutput,
  buildPrompt,
  validate: (out, input) => criteriaErrors(out.criteria, input.rubric.criteria),
  maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
  fake: (input) => ({
    criteria: input.rubric.criteria.map((c, i) => ({
      id: c.id,
      score: i === 0 ? c.max : Math.min(1, c.max),
      rationale: i === 0 ? 'Correct use of pointers.' : 'Explanation is incomplete.',
    })),
    misconceptions: [],
    rationale: 'Working solution; the explanation of pass-by-value is thin.',
    guidingQuestion: 'What does C copy when you pass an int to a function?',
  }),
})
