/**
 * Role → model routing (Tech Stack §2 "Model routing table", ADR-005).
 * The ONE place model slugs live. Slugs checked against the AI Gateway catalog on 4 Oct 2026.
 *
 * Cost switch (Architecture risk 3): if verifier rejections exceed ~40%, flip
 * REASONER_USES_OPUS to true — `reasoner` then runs on Opus 5.5 (≈ 2× generation cost).
 */

export const REASONER_USES_OPUS = false

export const MODEL_SLUGS = {
  sonnet: 'anthropic/claude-sonnet-5.5',
  opus: 'anthropic/claude-opus-5.5',
  sol: 'openai/gpt-6.1-sol',
  solPrevious: 'openai/gpt-6-sol',
  luna: 'openai/gpt-6-luna',
  geminiFlash: 'google/gemini-3.8-flash',
  jev: 'typesafe-ai/jev',
} as const

export type ModelSlug = (typeof MODEL_SLUGS)[keyof typeof MODEL_SLUGS]

/** AI SDK 7 top-level `reasoning` values we use. */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high'

export type Role =
  | 'reasoner'
  | 'reasoner-premium'
  | 'verifier'
  | 'judge'
  | 'persona'
  | 'answerer'
  | 'guard'
  | 'guard-escalation'
  | 'vision'
  | 'transcriber'

export interface ModelChoice {
  readonly model: ModelSlug
  readonly reasoning: ReasoningEffort
}

export interface RoleConfig {
  readonly primary: ModelChoice
  /** null = no model fallback (guard-escalation falls back to a canned deflection). */
  readonly fallback: ModelChoice | null
  /** Only for `guard`: the role to escalate to instead of a model fallback. */
  readonly escalateTo?: Role
  readonly timeoutMs?: number
  /**
   * Set for roles that call a provider's own API instead of the AI Gateway (ADR-017). Such a role
   * has no attempt plan: `runTask` sends it to that client and nowhere else.
   */
  readonly direct?: 'google'
  readonly note: string
}

/** Output-token limits that leave room for reasoning tokens (Architecture §5.1). */
export const MAX_OUTPUT_TOKENS = {
  extraction: 16_000,
  itemBatch: 12_000,
  verifier: 4_000,
  judge: 4_000,
  persona: 600,
  guardEscalation: 300,
  answerer: 2_000,
  /** The spike's request shape: room for thinking on a 2-minute clip (~1.5k tokens out). */
  transcriber: 65_000,
  smoke: 200,
} as const

export const JEV_TIMEOUT_MS = 800

/**
 * The direct Google API (ADR-017, F10.5): model and list prices (USD per 1M tokens, ≤ 200k
 * context, 7 Oct 2026) used to price `llm_calls` rows, since the direct key reports no cost.
 * Output includes thinking tokens.
 */
export const GOOGLE_DIRECT = {
  model: 'gemini-3.8-flash',
  inputUsdPerMTok: 0.75,
  outputUsdPerMTok: 3.75,
} as const

const sonnet = (reasoning: ReasoningEffort): ModelChoice => ({
  model: MODEL_SLUGS.sonnet,
  reasoning,
})
const flash = (reasoning: ReasoningEffort): ModelChoice => ({
  model: MODEL_SLUGS.geminiFlash,
  reasoning,
})

export const ROLES: Readonly<Record<Role, RoleConfig>> = {
  reasoner: {
    primary: REASONER_USES_OPUS
      ? { model: MODEL_SLUGS.opus, reasoning: 'medium' }
      : sonnet('medium'),
    fallback: flash('medium'),
    note: 'concept extraction, item drafting; medium in pipeline, tasks pass low for on-demand',
  },
  'reasoner-premium': {
    primary: { model: MODEL_SLUGS.opus, reasoning: 'medium' },
    fallback: sonnet('high'),
    note: 'library seed only (scripts/seed-library.ts, dev key)',
  },
  verifier: {
    primary: { model: MODEL_SLUGS.sol, reasoning: 'medium' },
    // Never Claude: independence from the generator family.
    fallback: { model: MODEL_SLUGS.solPrevious, reasoning: 'medium' },
    note: 'blind-solve + check every generated item',
  },
  judge: {
    primary: { model: MODEL_SLUGS.sol, reasoning: 'medium' },
    // Outage only; recorded in attempts.judge_model via TaskResult.model.
    fallback: flash('medium'),
    note: 'criterion-level 0–2 grading, single run',
  },
  persona: {
    primary: sonnet('low'),
    fallback: flash('low'),
    note: 'confused friend + author; ≤ 600 output tokens incl. reasoning',
  },
  answerer: {
    primary: sonnet('medium'),
    fallback: flash('medium'),
    note: 'Stump the AI answer',
  },
  guard: {
    primary: { model: MODEL_SLUGS.jev, reasoning: 'none' },
    fallback: null,
    escalateTo: 'guard-escalation',
    timeoutMs: JEV_TIMEOUT_MS,
    note: 'leak check decision model (experimental_evaluate)',
  },
  'guard-escalation': {
    primary: { model: MODEL_SLUGS.luna, reasoning: 'low' },
    fallback: null,
    note: 'gray zone / Jev unavailable; failure → canned deflection (fail closed)',
  },
  vision: {
    primary: flash('low'),
    fallback: sonnet('low'),
    note: 'slides pages without a text layer (Should)',
  },
  transcriber: {
    // Never through the gateway: it drops the clip offsets and bills the whole video (spike).
    primary: flash('none'),
    fallback: null,
    direct: 'google',
    note: 'YouTube transcripts, 2-minute clips via the direct Google API (ADR-017)',
  },
}

export function roleConfig(role: Role): RoleConfig {
  return ROLES[role]
}

/** True for roles that must never go through the AI Gateway. */
export const isDirectRole = (role: Role): boolean => ROLES[role].direct !== undefined
