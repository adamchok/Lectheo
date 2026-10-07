import { z } from 'zod'
import { Id, MasterySummary, SourceRef } from '../common'
import { ConfidenceLevel, DiagnosticRound, Finding } from '../enums'

/** F3.10: optional; `rest` tests the concepts still *Not tested*. */
export const StartDiagnosticRequest = z.object({ round: DiagnosticRound.default('core') })
export type StartDiagnosticRequest = z.infer<typeof StartDiagnosticRequest>

export const DiagnosticItemStub = z.object({
  id: Id,
  conceptId: Id,
  stem: z.string(),
  position: z.number().int(),
})
export const StartDiagnosticResponse = z.object({
  sessionId: Id,
  items: z.array(DiagnosticItemStub),
  maxFollowUps: z.number().int(),
  /** Set when fewer than 3 verified items exist (F3.7) or there are no markers (F3.1). */
  note: z.string().optional(),
})
export type StartDiagnosticResponse = z.infer<typeof StartDiagnosticResponse>

export const DiagnosticSessionResponse = z.object({
  sessionId: Id,
  status: z.enum(['active', 'completed']),
  items: z.array(
    z.object({
      id: Id,
      stem: z.string(),
      position: z.number().int(),
      isFollowUp: z.boolean(),
      confidence: ConfidenceLevel.optional(),
      answered: z.boolean(),
      correct: z.boolean().optional(),
    }),
  ),
})

export const ConfidenceRequest = z.object({ level: ConfidenceLevel })
export const McqOption = z.object({ id: z.string(), text: z.string() })
export const ConfidenceResponse = z.object({ options: z.array(McqOption) })

export const AnswerRequest = z.object({ optionId: z.string().min(1) })
export const AnswerResponse = z.object({
  correct: z.boolean(),
  confidence: ConfidenceLevel,
  finding: Finding,
  correctOptionId: z.string(),
  whyYourChoiceIsWrong: z.string().nullable(),
  explanation: z.string(),
  source: SourceRef.nullable(),
  followUp: z.object({ itemId: Id, stem: z.string() }).nullable(),
  mastery: MasterySummary,
})
export type AnswerResponse = z.infer<typeof AnswerResponse>

export const DiagnosticResultsResponse = z.object({
  findings: z.array(
    z.object({
      itemId: Id,
      conceptId: Id,
      conceptName: z.string(),
      finding: Finding,
      confidence: ConfidenceLevel,
      source: SourceRef.nullable(),
    }),
  ),
  summary: z.object({
    total: z.number().int(),
    confidentMistakes: z.number().int(),
    wrong: z.number().int(),
    unsureRight: z.number().int(),
    right: z.number().int(),
  }),
  note: z.string().optional(),
  /** F3.10–F3.11: the lecture's concepts tested so far (any round, any activity). */
  coverage: z.object({
    tested: z.number().int(),
    total: z.number().int(),
    /** Untested concepts with no verified question (F3.11). */
    noQuestion: z.number().int(),
    /** Untested concepts *Test the rest* can still ask about. */
    untested: z.number().int(),
    byChapter: z.array(
      z.object({
        chapterId: z.string(),
        title: z.string(),
        tested: z.number().int(),
        total: z.number().int(),
      }),
    ),
  }),
})
export type DiagnosticResultsResponse = z.infer<typeof DiagnosticResultsResponse>
