import { lectureContext, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { ExtractConceptsInput } from './schema'

export const PROMPT_VERSION = 'extract-concepts@0.1'

// TODO(feature-pipeline): first draft. Add CS50 few-shot examples and tune on Lectures 3–5.
export const SYSTEM = [
  'You build a concept map of a computer-science lecture for students.',
  'Extract the key concepts that the lecture actually teaches, each grounded in transcript',
  'segments cited by index. Segment [s42] is cited as 42.',
  'Rules:',
  '- canonicalKey: lower-kebab-case normalised name (e.g. "linked-list"). If a concept already',
  '  exists in the course list, reuse its canonicalKey exactly.',
  '- summary: one sentence, grounded in the cited segments.',
  '- salience: 0..1, how central the concept is to this lecture.',
  '- keyPoints: 2 to 5 facts a student must be able to explain; ids "k1", "k2", …; each cites',
  '  segments.',
  '- edges: relations between concepts by canonicalKey; depends_on means "must understand',
  '  first"; no self-edges; depends_on must not form a cycle.',
  '- Cite only segment indexes that appear in the transcript.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: ExtractConceptsInput): PromptSpec {
  const existing =
    input.existingConcepts.length > 0
      ? input.existingConcepts.map((c) => `- ${c.canonicalKey}: ${c.name}`).join('\n')
      : '(none)'
  return {
    system: SYSTEM,
    cacheKeyBlocks: [lectureContext(input.segments)],
    prompt: [
      `Lecture: ${input.lectureTitle}`,
      `Existing course concepts:\n${existing}`,
      `Extract about ${input.targetCount} concepts (±2) and their edges.`,
    ].join('\n\n'),
  }
}
