import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { criteriaErrors } from '../common'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { JudgeCorrectionOutput, type JudgeCorrectionInput } from './schema'

export { gradedCriteria } from '../common'

/** Spot-the-flaw correction grading (GPT-6.1 Sol, single run). Record TaskResult.model. */
export const judgeCorrectionTask = defineTask<JudgeCorrectionInput, JudgeCorrectionOutput>({
  name: 'judge-correction',
  role: 'judge',
  promptVersion: PROMPT_VERSION,
  schema: JudgeCorrectionOutput,
  buildPrompt,
  validate: (out, input) => criteriaErrors(out.criteria, input.rubric.criteria),
  maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
  fake: (input) => ({
    criteria: input.rubric.criteria.map((c) => ({
      id: c.id,
      score: c.max,
      rationale: 'Matches the reference correction.',
    })),
    misconceptions: [],
    rationale: 'The correction names the error and states the right behaviour.',
    guidingQuestion: 'Can you give one concrete case that shows your corrected sentence holds?',
  }),
})
