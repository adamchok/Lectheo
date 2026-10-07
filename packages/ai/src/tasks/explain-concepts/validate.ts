import { ConceptDepth } from '@lectheo/contracts'
import type { ExplainConceptsOutput, ExplainedConcept } from './schema'

/** F9.14: no outside links. Any URL-looking text drops the concept's depth. */
const URL_PATTERN = /\bhttps?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i
const MAX_PARAGRAPHS = 4
const MAX_MISTAKES = 3

const texts = (c: ExplainedConcept): string[] => [
  ...c.howItWorks.map((p) => p.text),
  ...(c.example ? [c.example.text, c.example.code ?? ''] : []),
  ...c.mistakes.flatMap((m) => [m.mistake, m.why]),
]

/** One concept's depth, or null when it fails a check (it is dropped, never the lecture). */
function toDepth(c: ExplainedConcept, known: ReadonlySet<number>): ConceptDepth | null {
  if (texts(c).some((t) => URL_PATTERN.test(t))) return null
  const code = c.example?.code?.trimEnd()
  const parsed = ConceptDepth.safeParse({
    howItWorks: c.howItWorks.slice(0, MAX_PARAGRAPHS).map((p) => ({
      text: p.text.trim(),
      cites: [...new Set(p.cites.filter((i) => known.has(i)))],
    })),
    example: c.example && {
      text: c.example.text.trim(),
      ...(code?.trim() ? { code } : {}),
      beyondLecture: c.example.beyondLecture,
    },
    mistakes: c.mistakes
      .slice(0, MAX_MISTAKES)
      .map((m) => ({ mistake: m.mistake.trim(), why: m.why.trim() })),
  })
  // ConceptDepth needs 2–4 paragraphs with at least one citation each: a paragraph that cited
  // only segments outside the lecture fails here.
  return parsed.success ? parsed.data : null
}

/**
 * The valid depth per concept key (F9.14). `known` is every segment index of the lecture; keys
 * not asked for and repeats are ignored. Invalid concepts are left out, so they get no depth.
 */
export function toDepths(
  output: ExplainConceptsOutput,
  keys: ReadonlySet<string>,
  known: ReadonlySet<number>,
): Map<string, ConceptDepth> {
  const depths = new Map<string, ConceptDepth>()
  for (const c of output.concepts) {
    if (!keys.has(c.conceptKey) || depths.has(c.conceptKey)) continue
    const depth = toDepth(c, known)
    if (depth) depths.set(c.conceptKey, depth)
  }
  return depths
}
