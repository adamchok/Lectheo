import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { fakeExtractConcepts } from './fake'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { ExtractConceptsOutput, type ExtractConceptsInput } from './schema'
import { validateExtraction } from './validate'

/** Pipeline step extractConcepts (Architecture §4.3). The DAG check stays in validateGraph. */
export const extractConceptsTask = defineTask<ExtractConceptsInput, ExtractConceptsOutput>({
  name: 'extract-concepts',
  role: 'reasoner',
  promptVersion: PROMPT_VERSION,
  schema: ExtractConceptsOutput,
  buildPrompt,
  validate: validateExtraction,
  maxOutputTokens: MAX_OUTPUT_TOKENS.extraction,
  fake: fakeExtractConcepts,
})
