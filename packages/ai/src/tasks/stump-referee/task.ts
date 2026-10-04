import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { citationErrors, firstIdxs, segmentSet } from '../common'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import { StumpRefereeOutput, type StumpRefereeInput } from './schema'

function validateReferee(out: StumpRefereeOutput, input: StumpRefereeInput): string[] {
  const modeErrors =
    input.mode === 'compare'
      ? out.aiCorrect === null
        ? ['compare mode requires aiCorrect']
        : []
      : out.aiCorrect !== null
        ? ['validate mode requires aiCorrect = null']
        : []
  const allChecks = out.onConcept && out.unambiguous && out.answerable && out.keyCorrect
  const validity = out.valid && !allChecks ? ['valid is true but a check failed'] : []
  // Referee notes may cite course_knowledge instead of segments (ADR-012).
  const citations = out.usesCourseKnowledge
    ? []
    : citationErrors(out.segmentIdxs, segmentSet(input.segments), 'segmentIdxs')
  return [...modeErrors, ...validity, ...citations]
}

/** Stump the AI referee (Should). Judge family ≠ answerer family. */
export const stumpRefereeTask = defineTask<StumpRefereeInput, StumpRefereeOutput>({
  name: 'stump-referee',
  role: 'judge',
  promptVersion: PROMPT_VERSION,
  schema: StumpRefereeOutput,
  buildPrompt,
  validate: validateReferee,
  maxOutputTokens: MAX_OUTPUT_TOKENS.judge,
  fake: (input) => ({
    valid: true,
    onConcept: true,
    unambiguous: true,
    answerable: true,
    keyCorrect: true,
    aiCorrect: input.mode === 'compare' ? true : null,
    reason: 'A fair question about the lecture with a correct key.',
    segmentIdxs: firstIdxs(input.segments, 1),
    usesCourseKnowledge: input.segments.length === 0,
  }),
})
