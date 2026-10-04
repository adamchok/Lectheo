import type { ChatTurn } from '../common'

/** Streamed plain text — no output schema. */
export interface FriendReplyInput {
  readonly conceptName: string
  /** Full conversation; the last turn is the student's newest message. */
  readonly history: readonly ChatTurn[]
  readonly turn: number
  readonly maxTurns: number
}
