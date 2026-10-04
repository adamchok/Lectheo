import {
  draftItemsTask,
  MAX_OUTPUT_TOKENS,
  runTask,
  type DraftItemsInput,
  type DraftItemsOutput,
  type TaskContext,
  type TaskDef,
} from '@lectheo/ai'
import type { ItemKind } from '@lectheo/contracts'
import { DRAFT_DIRECTIVES } from './curriculum'

/*
 * Seed-mode item drafting (F7.3): wave 2's draft-items task on `reasoner-premium` (Opus 5.5), with
 * the library bank's per-concept mix spelled out and checked: 2 MCQs (4 options), 2 spot-the-flaw
 * scenarios (an exact flawed/correct split so ~25–30% of the bank is correct), 1 transfer problem.
 * The teach-back rubric is the concept's key points (no item kind).
 */

/** Item slot: spot_flaw is split by whether the scenario is flawed, so redrafts keep the mix. */
export type Slot = 'mcq' | 'flawed' | 'correct' | 'transfer'

export const SLOT_KIND: Readonly<Record<Slot, ItemKind>> = {
  mcq: 'diagnostic_mcq',
  flawed: 'spot_flaw',
  correct: 'spot_flaw',
  transfer: 'transfer',
}

export interface SeedRequest {
  conceptKey: string
  counts: Readonly<Record<Slot, number>>
}

export interface SeedConcept {
  canonicalKey: string
  name: string
  summary: string
  keyPoints: readonly { id: string; text: string }[]
}

const MCQ_OPTIONS = 4
const SEED_MAX_OUTPUT_TOKENS = MAX_OUTPUT_TOKENS.extraction

export const MISCONCEPTION_MCQ = /always O\(1\)/i
export const MISCONCEPTION_FLAW = /always takes O\(1\)/i

function seedRules(requests: readonly SeedRequest[], feedback: string | null): string {
  const mix = requests
    .map(({ conceptKey: k, counts: c }) => {
      const flaws = `${c.flawed} flawed + ${c.correct} fully correct spot-flaw`
      return `- ${k}: ${c.mcq} mcq, ${flaws}, ${c.transfer} transfer`
    })
    .join('\n')
  const directives = requests
    .map((r) => DRAFT_DIRECTIVES[r.conceptKey])
    .filter((d): d is string => Boolean(d))
  return [
    'Library bank rules (pre-generated CS50 course):',
    `- MCQ: exactly ${MCQ_OPTIONS} options with ids "a"–"d"; vary which letter is correct.`,
    '- Student-facing text (stems, options, scenario sentences, prompts, hints) must stand alone:',
    '  never mention segments, the transcript or citations. Plain text, C code inline if needed.',
    '- Spot the flaw: the error must be conceptual (not a typo) and only one sentence may be wrong;',
    '  fully correct scenarios must be correct in every sentence.',
    '- Transfer: a new situation that is not in the lecture, answerable in a few sentences; a model',
    '  solution and a rubric with 2–4 criteria.',
    '- Hints nudge without giving the answer away.',
    `Exact mix per concept:\n${mix}`,
    ...directives,
    feedback ? `Earlier drafts were rejected by an independent checker:\n${feedback}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function seedErrors(out: DraftItemsOutput, requests: readonly SeedRequest[]): string[] {
  return [
    ...out.mcq
      .filter((d) => d.options.length !== MCQ_OPTIONS)
      .map((d) => `${d.conceptKey} mcq: needs exactly ${MCQ_OPTIONS} options`),
    ...requests.flatMap(({ conceptKey: k, counts }) => {
      const mine = out.spotFlaw.filter((d) => d.conceptKey === k)
      const flawed = mine.filter((d) => d.hasFlaw).length
      const split =
        flawed === counts.flawed && mine.length - flawed === counts.correct
          ? []
          : [`${k}: need ${counts.flawed} flawed and ${counts.correct} correct spot-flaw`]
      return [...split, ...directiveErrors(out, k, counts)]
    }),
  ]
}

/** The F7.3 classic-misconception directive (hash tables), checked on the draft. */
function directiveErrors(
  out: DraftItemsOutput,
  key: string,
  counts: SeedRequest['counts'],
): string[] {
  if (!DRAFT_DIRECTIVES[key]) return []
  return [
    ...(counts.mcq === 0 ||
    out.mcq.some(
      (d) =>
        d.conceptKey === key && d.distractors.some((x) => MISCONCEPTION_MCQ.test(x.misconception)),
    )
      ? []
      : [`${key}: an MCQ distractor misconception must be "Hash table lookup is always O(1)"`]),
    ...(counts.flawed === 0 ||
    out.spotFlaw.some((d) => d.conceptKey === key && isMisconceptionFlaw(d))
      ? []
      : [`${key}: a flawed scenario's wrong sentence must say lookup "always takes O(1)"`]),
  ]
}

export const isMisconceptionFlaw = (d: {
  hasFlaw: boolean
  flawSentenceIdx: number | null
  sentences: readonly string[]
}): boolean =>
  d.hasFlaw &&
  d.flawSentenceIdx !== null &&
  MISCONCEPTION_FLAW.test(d.sentences[d.flawSentenceIdx] ?? '')

function seedDraftTask(
  requests: readonly SeedRequest[],
  feedback: string | null,
): TaskDef<DraftItemsInput, DraftItemsOutput> {
  const base = draftItemsTask
  return {
    ...base,
    name: 'seed-draft-items',
    role: 'reasoner-premium',
    promptVersion: `${base.promptVersion}+seed.1`,
    maxOutputTokens: SEED_MAX_OUTPUT_TOKENS,
    buildPrompt: (input) => {
      const spec = base.buildPrompt(input)
      return { ...spec, prompt: `${spec.prompt ?? ''}\n\n${seedRules(requests, feedback)}` }
    },
    validate: (out, input) => [
      ...(base.validate?.(out, input) ?? []),
      ...seedErrors(out, requests),
    ],
  }
}

export interface DraftBatch {
  model: string
  promptVersion: string
  output: DraftItemsOutput
}

export async function draftBatch(
  segments: readonly { idx: number; text: string }[],
  concepts: readonly SeedConcept[],
  requests: readonly SeedRequest[],
  feedback: string | null,
  ctx: TaskContext,
): Promise<DraftBatch> {
  const task = seedDraftTask(requests, feedback)
  const { output, model } = await runTask(
    task,
    {
      segments,
      concepts,
      requests: requests.map(({ conceptKey, counts: c }) => ({
        conceptKey,
        mcq: c.mcq,
        spotFlaw: c.flawed + c.correct,
        transfer: c.transfer,
      })),
    },
    ctx,
  )
  return { model, promptVersion: task.promptVersion, output }
}
