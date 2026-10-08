import { z } from 'zod'
import type { CourseTitles } from '../../prompt'
import type { ChatTurn } from '../common'

/** ADR-009: the author never receives flaw info — only the scenario and the conversation. */
export interface AuthorReplyInput extends CourseTitles {
  readonly conceptName: string
  readonly scenarioSentences: readonly string[]
  readonly history: readonly ChatTurn[]
  readonly studentMessage: string
  /** Second attempt after the leak check blocked the first reply. */
  readonly stricter: boolean
}

export const AuthorReplyOutput = z.object({ reply: z.string() })
export type AuthorReplyOutput = z.infer<typeof AuthorReplyOutput>

/** ≈ 150 tokens (ADR-009). */
export const AUTHOR_REPLY_MAX_WORDS = 110
