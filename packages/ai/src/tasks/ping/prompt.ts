import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { PingInput } from './schema'

export const PROMPT_VERSION = 'ping@1'

export function buildPrompt(input: PingInput): PromptSpec {
  return {
    system: `You echo words. ${UNTRUSTED_RULE}`,
    prompt:
      'Return JSON {"echo": the word inside <item>, "length": its number of characters}.\n' +
      untrusted('item', input.word),
  }
}
