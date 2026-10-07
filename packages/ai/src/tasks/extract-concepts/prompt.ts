import { lectureContext, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { ExtractConceptsInput } from './schema'

export const PROMPT_VERSION = 'extract-concepts@0.3'

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
  '- If the lecture teaches no real concepts (e.g. an admin or logistics session), return empty',
  '  concepts and edges instead of inventing any.',
  '- chapters: only when asked; otherwise return an empty list. Split the whole lecture into',
  '  consecutive chapters like a well-chaptered video. startIdx is the segment the chapter starts',
  '  at (42 for [s42]); never give times. The first chapter starts at the first segment; each',
  '  next chapter starts later than the one before; a chapter ends where the next one starts.',
  '  title: 2–6 words. summary: one line on what happens in it. conceptKeys: the canonicalKeys',
  '  (from your concepts or the course list) that the chapter teaches; empty for parts that teach',
  '  no concept, which still get their own chapter ("Announcements", "Q&A", "Recap").',
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

function chaptersAsk(count: ExtractConceptsInput['chapterCount']): string {
  if (!count) return 'Chapters: not wanted for this lecture; return an empty list.'
  return `Chapters: split the lecture into ${count.min} to ${count.max} chapters.`
}
