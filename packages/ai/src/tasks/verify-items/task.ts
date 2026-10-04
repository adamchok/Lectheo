import { MAX_OUTPUT_TOKENS } from '../../models'
import { defineTask } from '../../run-task'
import { buildPrompt, PROMPT_VERSION } from './prompt'
import {
  VerifyItemsOutput,
  type ItemSolution,
  type VerifyItem,
  type VerifyItemsInput,
} from './schema'

export { toVerification } from './verdict'

/** Fake drafts plant their flaw as "…on the stack"; the fake verifier "finds" it there. */
const FAKE_FLAW_MARKER = 'on the stack'

function fakeSolution(item: VerifyItem): ItemSolution {
  const payload = item.publicPayload as { options?: { id: string }[]; sentences?: string[] } | null
  const flawIdx = (payload?.sentences ?? []).findIndex((s) => s.includes(FAKE_FLAW_MARKER))
  const solvedAnswer =
    item.kind === 'diagnostic_mcq'
      ? (payload?.options?.[0]?.id ?? 'a')
      : item.kind === 'spot_flaw'
        ? flawIdx >= 0
          ? 'flawed'
          : 'correct'
        : 'Use pointers so the callee can modify the caller’s variables.'
  return {
    ref: item.ref,
    solvedAnswer,
    flawSentenceIdx: item.kind === 'spot_flaw' && flawIdx >= 0 ? flawIdx : null,
    singleAnswer: true,
    citationsSupport: true,
    unambiguous: true,
    reasons: [],
  }
}

/** Pipeline step verifyItems: GPT-6.1 Sol blind-solves each draft (different family). */
export const verifyItemsTask = defineTask<VerifyItemsInput, VerifyItemsOutput>({
  name: 'verify-items',
  role: 'verifier',
  promptVersion: PROMPT_VERSION,
  schema: VerifyItemsOutput,
  buildPrompt,
  validate: (out, input) => {
    const refs = input.items.map((i) => i.ref)
    const got = out.results.map((r) => r.ref)
    return [
      ...refs.filter((r) => !got.includes(r)).map((r) => `missing result for ${r}`),
      ...got.filter((r) => !refs.includes(r)).map((r) => `unknown ref ${r}`),
    ]
  },
  maxOutputTokens: MAX_OUTPUT_TOKENS.verifier,
  // Fake: MCQ picks the first option (fake drafts put the key at "a").
  fake: (input) => ({ results: input.items.map(fakeSolution) }),
})
