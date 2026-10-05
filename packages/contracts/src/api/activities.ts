import { z } from 'zod'
import { ClientId, Id, MasterySummary, SourceRef } from '../common'
import { ActivityStatus, ActivityType, CourseKind, Outcome } from '../enums'
import { StumpResult } from '../payloads'

export const CreateActivityRequest = z.object({
  id: ClientId,
  conceptId: Id,
  type: ActivityType,
  persona: z.string().optional(),
})

const ConceptRef = z.object({ id: Id, name: z.string() })
const Base = { id: Id, concept: ConceptRef }

export const CreateActivityResponse = z.discriminatedUnion('type', [
  z.object({
    ...Base,
    type: z.literal('spot_flaw'),
    scenario: z.object({ sentences: z.array(z.string()) }),
    turnBudget: z.number().int(),
    hintsAvailable: z.number().int(),
  }),
  z.object({
    ...Base,
    type: z.literal('teach_back'),
    persona: z.object({ key: z.string(), name: z.string() }),
    opener: z.string(),
    turnBudget: z.number().int(),
  }),
  z.object({ ...Base, type: z.literal('transfer'), prompt: z.string() }),
  z.object({ ...Base, type: z.literal('stump'), guidance: z.string() }),
])
export type CreateActivityResponse = z.infer<typeof CreateActivityResponse>

export const Feedback = z.object({
  guidingQuestion: z.string().nullable(),
  hint: z.string().nullable(),
})

/**
 * Stump try as GET returns it: the student's own question + key with the referee result.
 * `studentKey`, not `answerKey`: responses never carry a field named like the 🔒 item key.
 */
export const StumpTry = StumpResult.extend({ question: z.string(), studentKey: z.string() })
export type StumpTry = z.infer<typeof StumpTry>

export const ActivityResponse = z.object({
  id: Id,
  type: ActivityType,
  concept: ConceptRef,
  /** The concept's course: the "See it on the map" link and the library license notice (F7.4). */
  courseId: Id,
  courseKind: CourseKind,
  status: ActivityStatus,
  turnsUsed: z.number().int(),
  turnBudget: z.number().int(),
  hintsUsed: z.number().int(),
  /** spot_flaw only: scenario sentences (public payload). */
  scenario: z.object({ sentences: z.array(z.string()) }).nullable(),
  /** transfer only: the problem (public payload). */
  prompt: z.string().optional(),
  tries: z.array(
    z.object({
      tryNo: z.number().int(),
      outcome: Outcome,
      feedback: Feedback,
      /** Stump only, so a reload can show the last verdict. */
      stump: StumpTry.optional(),
    }),
  ),
  messages: z.array(
    z.object({
      role: z.enum(['student', 'persona']),
      content: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
})
export type ActivityResponse = z.infer<typeof ActivityResponse>

export const PostMessageRequest = z.object({ text: z.string().trim().min(1).max(2000) })
/** spot_flaw reply (JSON). teach_back replies stream as an AI SDK UI message stream. */
export const AuthorReplyResponse = z.object({ reply: z.string(), turnsLeft: z.number().int() })

export const HintResponse = z.object({
  hint: z.string(),
  hintsUsed: z.number().int(),
  hintsLeft: z.number().int(),
})

export const SubmitSpotFlaw = z.object({
  verdict: z.enum(['flawed', 'correct']),
  flawSentenceIdx: z.number().int().nonnegative().optional(),
  correction: z.string().max(1000).optional(),
})
export const SubmitTeachBack = z.object({}).strict()
export const SubmitTransfer = z.object({ answer: z.string().min(1).max(4000) })
export const SubmitStump = z.object({
  question: z.string().min(10).max(1000),
  answerKey: z.string().min(1).max(2000),
})
export const SubmitBodyByType = {
  spot_flaw: SubmitSpotFlaw,
  teach_back: SubmitTeachBack,
  transfer: SubmitTransfer,
  stump: SubmitStump,
} as const

export const Criterion = z.object({
  id: z.string(),
  label: z.string(),
  score: z.number(),
  max: z.number(),
})
export const RubricCriterion = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
})

export const SubmitResponse = z.object({
  attemptId: Id,
  tryNo: z.number().int(),
  final: z.boolean(),
  outcome: Outcome,
  score: z.number(),
  maxScore: z.number(),
  checks: z.object({ verdict: z.boolean(), location: z.boolean().nullable() }).nullable(),
  criteria: z.array(Criterion),
  feedback: Feedback,
  canRetry: z.boolean(),
  explanationAvailable: z.boolean(),
  sources: z.array(SourceRef),
  mastery: MasterySummary,
  /** Only when final = true. */
  explanation: z.string().optional(),
  rubric: z.array(RubricCriterion).optional(),
  /** Stump only. */
  stump: StumpResult.optional(),
})
export type SubmitResponse = z.infer<typeof SubmitResponse>

export const ExplanationResponse = z.object({
  explanation: z.string(),
  sources: z.array(SourceRef),
  /** Only once the activity is closed (reopening it shows how it was graded). */
  rubric: z.array(RubricCriterion).optional(),
})
