import { lectureContext, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { DraftItemsInput } from './schema'

export const PROMPT_VERSION = 'draft-items@0.1'

// TODO(feature-items): first draft. Add CS50 few-shots incl. correct "no flaw" scenarios (~30%).
export const SYSTEM = [
  'You write practice items for a computer-science lecture. Every item must be answerable from',
  'the cited transcript segments and have exactly one defensible answer.',
  'MCQ: 3–5 options with ids "a", "b", …; exactly one correct; each wrong option has a',
  'distractor entry naming the misconception it targets and why it is wrong.',
  'Spot the flaw: a 3–5 sentence explanation written as if by a confident student. About 30% of',
  'scenarios are fully correct (hasFlaw=false, flaw fields null). Otherwise exactly one sentence',
  'contains a subtle conceptual error: give its 0-based index, a flawSummary, the correction,',
  'a rubric for judging a correction (criteria max 2), and leakKeywords (terms that would give',
  'the flaw away).',
  'Transfer: a short new problem applying the concept, a model solution and a rubric.',
  'Every item: two hints (general, then specific) and segment citations.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: DraftItemsInput): PromptSpec {
  const concepts = input.concepts
    .map((c) => {
      const points = c.keyPoints.map((k) => `  - ${k.id}: ${k.text}`).join('\n')
      return `${c.canonicalKey} — ${c.name}: ${c.summary}\n${points}`
    })
    .join('\n')
  const requests = input.requests
    .map((r) => `- ${r.conceptKey}: ${r.mcq} mcq, ${r.spotFlaw} spot-flaw, ${r.transfer} transfer`)
    .join('\n')
  return {
    system: SYSTEM,
    cacheKeyBlocks: [lectureContext(input.segments)],
    prompt: `Concepts:\n${concepts}\n\nWrite exactly:\n${requests}`,
  }
}
