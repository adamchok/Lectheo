import type { ExplainConceptsInput, ExplainConceptsOutput } from './schema'

/** Deterministic depth citing each concept's own first segment (AI_FAKE=1). */
export function fakeExplainConcepts(input: ExplainConceptsInput): ExplainConceptsOutput {
  return {
    concepts: input.concepts.map((c) => {
      const cites = c.segmentIdxs.slice(0, 1)
      return {
        conceptKey: c.key,
        howItWorks: [
          { text: `${c.summary} The lecture builds this up step by step.`, cites },
          { text: `${c.name} matters because later ideas rely on it.`, cites },
        ],
        example: {
          text: `A small worked example of ${c.name}.`,
          code: `// ${c.name}\nint n = 3;`,
          beyondLecture: true,
        },
        mistakes: [
          {
            mistake: `Thinking ${c.name} is always free.`,
            why: 'It has a cost the lecture shows.',
          },
          {
            mistake: `Confusing ${c.name} with its neighbours.`,
            why: 'They solve other problems.',
          },
        ],
      }
    }),
  }
}
