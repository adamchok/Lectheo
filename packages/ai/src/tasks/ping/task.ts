import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { PingOutput, type PingInput } from './schema'

/** Trivial structured-output task that proves the seam end to end (and is used by tests). */
export const pingTask = defineTask<PingInput, PingOutput>({
  name: 'ping',
  role: 'reasoner',
  promptVersion: PROMPT_VERSION,
  schema: PingOutput,
  buildPrompt,
  reasoning: 'low',
  validate: (out, input) => {
    const errors: string[] = []
    if (out.echo !== input.word) errors.push(`echo must be exactly "${input.word}"`)
    if (out.length !== input.word.length) errors.push(`length must be ${input.word.length}`)
    return errors
  },
  maxOutputTokens: MAX_OUTPUT_TOKENS.smoke,
  fake: (input) => ({ echo: input.word, length: input.word.length }),
})
