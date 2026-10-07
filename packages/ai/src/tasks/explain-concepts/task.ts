import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { fakeExplainConcepts } from './fake'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { ExplainConceptsOutput, type ExplainConceptsInput } from './schema'

export { toDepths } from './validate'

/**
 * Pipeline step explainConcepts (F9.13–F9.15, Architecture §4.3): one call per lecture, in
 * parallel with item drafting. No `validate` retry: `toDepths` drops invalid concepts, so a weak
 * answer never fails the lecture.
 */
export const explainConceptsTask = defineTask<ExplainConceptsInput, ExplainConceptsOutput>({
  name: 'explain-concepts',
  role: 'reasoner',
  promptVersion: PROMPT_VERSION,
  schema: ExplainConceptsOutput,
  buildPrompt,
  maxOutputTokens: MAX_OUTPUT_TOKENS.explanation,
  fake: fakeExplainConcepts,
})
