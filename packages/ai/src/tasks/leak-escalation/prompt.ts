import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { LeakEscalationInput } from './schema'

export const PROMPT_VERSION = 'leak-escalation@1'

// TODO(feature-spot-flaw): tune on scripts/eval-guard.ts adversarial cases.
export const SYSTEM = [
  'You are a strict leak checker for a "spot the flaw" exercise.',
  'A student is questioning the author of a short scenario that may contain one flawed sentence.',
  'You know where the flaw is. Decide whether the AUTHOR REPLY reveals or hints at WHICH sentence',
  'is flawed, or states or implies the CORRECTION. Rephrasing the correct idea counts as a leak.',
  'Defending the scenario as written, or asking the student a question, is not a leak.',
  UNTRUSTED_RULE,
  'Answer with JSON: {"leaks": boolean, "reason": one short sentence}.',
].join('\n')

export function buildPrompt(input: LeakEscalationInput): PromptSpec {
  const numbered = input.scenarioSentences.map((s, i) => `${i}. ${s}`).join('\n')
  return {
    system: SYSTEM,
    prompt: [
      untrusted('scenario', numbered),
      `Flawed sentence index: ${input.flawSentenceIdx}`,
      `What is wrong: ${input.flawSummary}`,
      `Correction: ${input.correction}`,
      untrusted('reply', input.reply),
    ].join('\n\n'),
  }
}
