// @lectheo/ai — the single AI seam (Architecture §3, §5). Task modules are also importable via
// '@lectheo/ai/tasks/<name>'.

export * from './models'
export * from './errors'
export * from './types'
export {
  UNTRUSTED_RULE,
  UNTRUSTED_TAGS,
  untrusted,
  lectureContext,
  estimateTokens,
  CACHE_MIN_TOKENS,
  type UntrustedTag,
  type PromptSegment,
} from './prompt'
export { gatewayCost, type UsageTotals } from './usage'
export { isFakeMode } from './call-model'
export {
  defineTask,
  runTask,
  FAKE_MODEL,
  type TaskDef,
  type TaskResult,
  type PromptSpec,
} from './run-task'
export {
  defineStreamTask,
  streamPersona,
  type StreamTaskDef,
  type PersonaStream,
} from './stream-task'
export {
  answerOnlyLeakInput,
  checkLeak,
  keywordHit,
  CANNED_DEFLECTION,
  GUARD_BLOCK_ABOVE,
  GUARD_PASS_BELOW,
  type GuardContext,
  type GuardDecision,
  type JevScores,
  type LeakCheckInput,
  type LeakCheckResult,
} from './guard'

export { pingTask } from './tasks/ping/task'
export { extractConceptsTask } from './tasks/extract-concepts/task'
export { draftItemsTask, toItemRecords, type ItemRecord } from './tasks/draft-items/task'
export { verifyItemsTask, toVerification } from './tasks/verify-items/task'
export { authorReplyTask } from './tasks/author-reply/task'
export { friendReplyTask } from './tasks/friend-reply/task'
export { judgeCorrectionTask } from './tasks/judge-correction/task'
export { judgeTeachBackTask, keyPointRubric } from './tasks/judge-teach-back/task'
export { judgeTransferTask } from './tasks/judge-transfer/task'
export { stumpRefereeTask } from './tasks/stump-referee/task'
export { gradedCriteria, type ChatTurn } from './tasks/common'
export type { ExtractConceptsInput, ExtractConceptsOutput } from './tasks/extract-concepts/schema'
export type { DraftItemsInput, DraftItemsOutput } from './tasks/draft-items/schema'
export type { VerifyItemsInput, VerifyItemsOutput, VerifyItem } from './tasks/verify-items/schema'
export type { AuthorReplyInput } from './tasks/author-reply/schema'
export type { FriendReplyInput } from './tasks/friend-reply/schema'
export type { JudgeCorrectionInput } from './tasks/judge-correction/schema'
export type { JudgeTeachBackInput } from './tasks/judge-teach-back/schema'
export type { JudgeTransferInput } from './tasks/judge-transfer/schema'
export type { StumpRefereeInput, StumpRefereeOutput } from './tasks/stump-referee/schema'
