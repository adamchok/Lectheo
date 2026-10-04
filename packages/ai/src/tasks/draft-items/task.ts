import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { fakeDraftItems } from './fake'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { DraftItemsOutput, type DraftItemsInput } from './schema'
import { validateDrafts } from './validate'

export { toItemRecords, type ItemRecord } from './map'

/**
 * Pipeline step draftItems (batches of 4 concepts) and on-demand generation.
 * On-demand callers use `{ ...draftItemsTask, reasoning: 'low' }`; the library seed uses
 * `{ ...draftItemsTask, role: 'reasoner-premium' }`.
 */
export const draftItemsTask = defineTask<DraftItemsInput, DraftItemsOutput>({
  name: 'draft-items',
  role: 'reasoner',
  promptVersion: PROMPT_VERSION,
  schema: DraftItemsOutput,
  buildPrompt,
  validate: validateDrafts,
  maxOutputTokens: MAX_OUTPUT_TOKENS.itemBatch,
  fake: fakeDraftItems,
})
