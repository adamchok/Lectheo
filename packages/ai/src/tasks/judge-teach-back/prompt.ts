import { untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import { JUDGE_RULES } from '../common'
import { KEY_POINT_MAX, type JudgeTeachBackInput } from './schema'

export const PROMPT_VERSION = 'judge-teach-back@1.0'

export const SYSTEM = [
  'A student taught a CS concept to a confused classmate in a short chat. Grade how well the',
  "STUDENT's own explanations cover each key point from the lecture.",
  '',
  'Scoring per key point (one criterion per key point; use the key point id as the criterion id):',
  '- 0: not mentioned, or stated wrongly.',
  '- 1: touched on but vague, incomplete or only implied (e.g. names the idea without saying',
  '  what it does or why).',
  `- ${KEY_POINT_MAX}: stated clearly and correctly in the student's own words; an accurate`,
  '  example that shows the idea also counts.',
  'Judge meaning, not wording. Credit a point once anywhere in the chat. Classmate questions are',
  'context only: never credit an idea that appears only in a question. A point stated correctly',
  'and later contradicted scores at most 1.',
  'Each criterion rationale: one short sentence about what the student said or missed.',
  '',
  'misconceptions: each factually wrong claim the student made about the concept, as a short',
  'neutral statement of what they said (empty if none). Not omissions, not style.',
  'rationale: one or two sentences of overall feedback addressed to the student ("you").',
  'guidingQuestion: one Socratic question aimed at the weakest key point. Do not state, quote or',
  'paraphrase any key point, and do not reveal the answer.',
  JUDGE_RULES,
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: JudgeTeachBackInput): PromptSpec {
  const points = input.keyPoints.map((k) => `- ${k.id}: ${k.text}`).join('\n')
  const dialogue = input.exchanges
    .map((e, i) => {
      const question = e.question ? `Classmate question ${i + 1}: ${e.question}\n` : ''
      return `${question}${untrusted('student_answer', e.answer)}`
    })
    .join('\n\n')
  return {
    system: SYSTEM,
    prompt: `Concept: ${input.conceptName}\n\nKey points (rubric):\n${points}\n\nChat:\n${dialogue}`,
  }
}
