import { lectureContext, untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { StumpRefereeInput } from './schema'

export const PROMPT_VERSION = 'stump-referee@0.1'

// TODO(feature-stump): first draft (Should, "beta").
export const SYSTEM = [
  'You referee "Stump the AI": a student writes a question and its answer key about a CS concept.',
  'Check: valid (a real question), onConcept, unambiguous, answerable from the lecture or',
  'standard course knowledge, keyCorrect. valid must be false if any check fails.',
  'In compare mode also judge whether the AI answer is correct against a correct key (aiCorrect);',
  'in validate mode aiCorrect is null. Cite supporting segments; set usesCourseKnowledge when',
  'the lecture alone does not settle it.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: StumpRefereeInput): PromptSpec {
  return {
    system: SYSTEM,
    cacheKeyBlocks: [lectureContext(input.segments)],
    prompt: [
      `Mode: ${input.mode}. Concept: ${input.conceptName}`,
      untrusted('student_question', input.question),
      untrusted('student_answer', input.answerKey),
      input.aiAnswer === null ? '' : `AI answer:\n${untrusted('reply', input.aiAnswer)}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
