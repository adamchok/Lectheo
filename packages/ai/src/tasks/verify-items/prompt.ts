import { lectureContext, untrusted, UNTRUSTED_RULE } from '../../prompt'
import type { PromptSpec } from '../../run-task'
import type { VerifyItemsInput } from './schema'

export const PROMPT_VERSION = 'verify-items@0.1'

// TODO(feature-items): first draft. Calibrate on ~20 hand-checked library items (eval-items).
export const SYSTEM = [
  'You are an independent checker of practice items for a computer-science lecture.',
  'For each item inside <item>, solve it yourself from the transcript; you are not given a key.',
  'diagnostic_mcq: solvedAnswer = the id of the one correct option.',
  'spot_flaw: solvedAnswer = "flawed" or "correct"; if flawed, flawSentenceIdx = 0-based index.',
  'transfer: solvedAnswer = a short solution.',
  'Then report: singleAnswer (exactly one defensible answer / at most one flaw), citationsSupport',
  '(the cited segments support your answer), unambiguous (wording admits one reading).',
  'Give short reasons for any false check. Return one result per item, same ref.',
  UNTRUSTED_RULE,
].join('\n')

export function buildPrompt(input: VerifyItemsInput): PromptSpec {
  const items = input.items
    .map((it) =>
      untrusted(
        'item',
        JSON.stringify({
          ref: it.ref,
          kind: it.kind,
          ...asObject(it.publicPayload),
          cites: it.segmentIdxs,
        }),
      ),
    )
    .join('\n')
  return { system: SYSTEM, cacheKeyBlocks: [lectureContext(input.segments)], prompt: items }
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}
