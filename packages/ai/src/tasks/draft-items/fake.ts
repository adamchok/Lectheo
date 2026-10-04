import { firstIdxs } from '../common'
import type {
  DraftConcept,
  DraftItemsInput,
  DraftItemsOutput,
  McqDraft,
  SpotFlawDraft,
  TransferDraft,
} from './schema'

const CORRECTION_RUBRIC = {
  criteria: [
    {
      id: 'c1',
      label: 'Names the error',
      description: 'Says what is wrong in the sentence',
      max: 2,
    },
    { id: 'c2', label: 'Correct fix', description: 'States the correct behaviour', max: 2 },
  ],
}

const HINTS = [
  'Think about what the variable actually stores.',
  'Compare what an address is with the value at that address.',
]

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

function fakeMcq(c: DraftConcept, idxs: number[], v: number): McqDraft {
  return {
    conceptKey: c.canonicalKey,
    stem: `(v${v + 1}) In C, after \`int *p = &x;\`, what does \`*p\` evaluate to? [${c.name}]`,
    options: [
      { id: 'a', text: 'The value stored in x' },
      { id: 'b', text: 'The address of x' },
      { id: 'c', text: 'The address of p' },
    ],
    correctOptionId: 'a',
    explanation: '`*p` dereferences p, following the stored address to the value of x.',
    distractors: [
      { optionId: 'b', misconception: 'Confuses p with *p', whyWrong: 'p holds the address' },
      { optionId: 'c', misconception: 'Confuses * with &', whyWrong: '&p is the address of p' },
    ],
    hints: HINTS,
    segmentIdxs: idxs,
  }
}

function fakeSpotFlaw(c: DraftConcept, idxs: number[], v: number): SpotFlawDraft {
  const sentences = [
    `${c.name} matters because C gives you direct access to memory.`,
    'malloc returns the address of a block of memory on the heap.',
    'You must call free on that address when you are done with it.',
  ]
  const flawed = v % 2 === 0
  return {
    conceptKey: c.canonicalKey,
    sentences: flawed
      ? [sentences[0] ?? '', 'malloc returns a block of memory on the stack.', sentences[2] ?? '']
      : sentences,
    hasFlaw: flawed,
    flawSentenceIdx: flawed ? 1 : null,
    flawSummary: flawed ? 'malloc allocates on the heap, not the stack.' : null,
    correction: flawed ? 'malloc returns the address of memory allocated on the heap.' : null,
    explanation: 'Heap memory from malloc persists until free; stack memory ends with the call.',
    rubric: CORRECTION_RUBRIC,
    hints: HINTS,
    leakKeywords: flawed ? ['heap'] : [],
    segmentIdxs: idxs,
  }
}

function fakeTransfer(c: DraftConcept, idxs: number[], v: number): TransferDraft {
  return {
    conceptKey: c.canonicalKey,
    prompt: `(v${v + 1}) Write a C function \`swap(int *a, int *b)\` and explain why it needs pointers.`,
    modelSolution:
      'int t = *a; *a = *b; *b = t; — pointers let the function change the caller’s values.',
    explanation: 'C passes arguments by value, so only addresses let a callee modify them.',
    rubric: CORRECTION_RUBRIC,
    hints: HINTS,
    segmentIdxs: idxs,
  }
}

export function fakeDraftItems(input: DraftItemsInput): DraftItemsOutput {
  const idxs = firstIdxs(input.segments, 2)
  const concept = (key: string): DraftConcept =>
    input.concepts.find((c) => c.canonicalKey === key) ?? {
      canonicalKey: key,
      name: key,
      summary: '',
      keyPoints: [],
    }
  return {
    mcq: input.requests.flatMap((r) =>
      range(r.mcq).map((v) => fakeMcq(concept(r.conceptKey), idxs, v)),
    ),
    spotFlaw: input.requests.flatMap((r) =>
      range(r.spotFlaw).map((v) => fakeSpotFlaw(concept(r.conceptKey), idxs, v)),
    ),
    transfer: input.requests.flatMap((r) =>
      range(r.transfer).map((v) => fakeTransfer(concept(r.conceptKey), idxs, v)),
    ),
  }
}
