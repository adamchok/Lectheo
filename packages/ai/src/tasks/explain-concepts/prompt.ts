import { lectureContext, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { ExplainConceptsInput } from './schema'

export const PROMPT_VERSION = 'explain-concepts@0.2'

export const SYSTEM = [
  'You explain the concepts of a university lecture in depth, for a student preparing to',
  'be tested on them. Write from the transcript segments given; cite them by index ([s42] is',
  'cited as 42). For each concept:',
  '- howItWorks: 2 to 4 short paragraphs (2–4 sentences each) on how it works and why. Every',
  '  paragraph cites at least one segment it is based on. Cite only segment indexes shown.',
  '- example: one worked example (a trace, a small calculation or code). Put code in `code`',
  '  (null otherwise), in the language the lecture uses. beyondLecture=true when the example',
  '  goes beyond what the lecture showed. null when no example fits.',
  '- mistakes: 2 or 3 common misconceptions, each with why it is wrong.',
  'Never include URLs, links or references to outside resources. Never give times; cite',
  'segments. Plain text, no markdown headings. Be accurate: if the lecture is vague, stay general',
  'rather than invent details.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: ExplainConceptsInput): PromptSpec {
  const concepts = input.concepts
    .map((c) => {
      const points = c.keyPoints.map((k) => `  - ${k}`).join('\n')
      const cites = c.segmentIdxs.map((i) => `s${i}`).join(', ')
      return `${c.key} — ${c.name}: ${c.summary}\n  taught in: ${cites}\n${points}`
    })
    .join('\n')
  return {
    system: SYSTEM,
    cacheKeyBlocks: [lectureContext(input.segments)],
    prompt: `Concepts:\n${concepts}\n\nExplain every concept above, once each, by its key.`,
  }
}
