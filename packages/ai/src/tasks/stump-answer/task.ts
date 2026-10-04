import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { StumpAnswerOutput, type StumpAnswerInput } from './schema'

/** Stump the AI answerer (Should). Never sees the student's key (Architecture §4.7). */
export const stumpAnswerTask = defineTask<StumpAnswerInput, StumpAnswerOutput>({
  name: 'stump-answer',
  role: 'answerer',
  promptVersion: PROMPT_VERSION,
  schema: StumpAnswerOutput,
  buildPrompt,
  validate: (out) => (out.answer.trim() ? [] : ['answer is empty']),
  maxOutputTokens: MAX_OUTPUT_TOKENS.answerer,
  fake: (input) => ({ answer: `My answer about ${input.conceptName}: it depends on the input.` }),
})
