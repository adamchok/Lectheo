import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { LeakEscalationOutput, type LeakEscalationInput } from './schema'

/** Gray-zone leak decision (GPT-6 Luna, low effort). Used by guard.ts, not by routes. */
export const leakEscalationTask = defineTask<LeakEscalationInput, LeakEscalationOutput>({
  name: 'leak-escalation',
  role: 'guard-escalation',
  promptVersion: PROMPT_VERSION,
  schema: LeakEscalationOutput,
  buildPrompt,
  maxOutputTokens: MAX_OUTPUT_TOKENS.guardEscalation,
  fake: () => ({ leaks: false, reason: 'fake mode: no leak detected' }),
})
