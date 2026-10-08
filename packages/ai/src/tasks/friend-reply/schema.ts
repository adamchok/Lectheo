import type { CourseTitles } from '../../prompt'
import type { ChatTurn } from '../common'

/** Streamed plain text — no output schema. */
export interface FriendReplyInput extends CourseTitles {
  readonly conceptName: string
  /** Public concept summary, so the friend stays on topic (never the 🔒 key points). */
  readonly conceptSummary?: string
  /** Full conversation; the last turn is the student's newest message. */
  readonly history: readonly ChatTurn[]
  readonly turn: number
  readonly maxTurns: number
}
