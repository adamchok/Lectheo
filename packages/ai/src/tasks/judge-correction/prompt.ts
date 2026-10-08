import { courseContext, untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import { JUDGE_RULES } from '../common'
import type { JudgeCorrectionInput } from './schema'

export const PROMPT_VERSION = 'judge-correction@0.3'

/*
 * Architecture §5.4: verdict + location are checked in code before this runs; the judge grades
 * ONLY the correction, per criterion, against the rubric frozen when the activity started.
 * Anchors are factual so the same correction gets the same score (F4c.7, ≥ 95%).
 */
export const SYSTEM = [
  "You grade one thing: a student's correction of the flawed sentence in a short explanation",
  'from the course named in <course_title>. Whether the student found the flaw was already',
  'checked; do not grade that.',
  JUDGE_RULES,
  '',
  'Score every rubric criterion on its own 0..max scale (max is usually 2):',
  '- max: the correction states the right claim from the reference, in any wording, with no',
  '  new false claim. Extra correct detail is fine.',
  '- 1 (or partial credit): right direction but vague, incomplete (misses a condition the',
  '  criterion names), or mixed with a false claim.',
  '- 0: wrong, missing, off-topic, only restates or negates the flawed sentence without saying',
  '  what is true, or only says "this is wrong". Also 0 when the correction is about a',
  '  different sentence than the flawed one (the student may have picked the wrong sentence).',
  'Judge meaning against the reference and the criterion text, not wording. Do not reward',
  'confidence, length or jargon. Use exactly the criterion ids given.',
  '',
  'Fields:',
  '- criteria: one entry per criterion id, integer score, one-sentence factual rationale.',
  '- misconceptions: short phrases for false beliefs the student text shows ([] if none).',
  '- rationale: one or two sentences summarising the grade.',
  '- guidingQuestion: ONE Socratic question to the student (second person, under 30 words)',
  '  that targets the biggest gap in their correction. It must not contain the reference',
  '  correction, the right value or term, or a yes/no question whose answer gives it away.',
  '  If the correction is fully right, ask them to justify it with a concrete case.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: JudgeCorrectionInput): PromptSpec {
  const criteria = input.rubric.criteria
    .map((c) => `- id "${c.id}" (0..${c.max}) ${c.label}: ${c.description}`)
    .join('\n')
  const flawed = input.scenarioSentences[input.flawSentenceIdx] ?? ''
  return {
    system: SYSTEM,
    prompt: [
      courseContext(input),
      untrusted('scenario', input.scenarioSentences.map((s, i) => `${i}. ${s}`).join('\n')),
      `Flawed sentence (index ${input.flawSentenceIdx}): ${flawed}`,
      `What is wrong with it: ${input.flawSummary}`,
      `Reference correction: ${input.correction}`,
      `Rubric criteria:\n${criteria}`,
      "Student's correction:",
      untrusted('student_answer', input.studentCorrection),
      'Return JSON {"criteria": [...], "misconceptions": [...], "rationale": "...", ' +
        '"guidingQuestion": "..."}.',
    ].join('\n\n'),
  }
}
