import { z } from 'zod'
import { SourceRef } from './common'

/**
 * Shapes of jsonb columns (Data Model §2). Every jsonb column is validated with these.
 * 🔒 = server-only. Never put a 🔒 schema inside an API response schema (contract test).
 */

export const SegmentIdxs = z.array(z.number().int().nonnegative()).min(1)

// ---------- items.public_payload (the only part clients see) ----------

export const McqPublicPayload = z.object({
  stem: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).min(3).max(5),
})
export const SpotFlawPublicPayload = z.object({
  sentences: z.array(z.string()).min(3).max(5),
})
export const TransferPublicPayload = z.object({ prompt: z.string() })

export const PublicPayloadByKind = {
  diagnostic_mcq: McqPublicPayload,
  spot_flaw: SpotFlawPublicPayload,
  transfer: TransferPublicPayload,
} as const
export type McqPublicPayload = z.infer<typeof McqPublicPayload>
export type SpotFlawPublicPayload = z.infer<typeof SpotFlawPublicPayload>
export type TransferPublicPayload = z.infer<typeof TransferPublicPayload>

// ---------- 🔒 item_secrets ----------

export const McqAnswerKey = z.object({ correctOptionId: z.string(), explanation: z.string() })
export const SpotFlawAnswerKey = z.object({
  hasFlaw: z.boolean(),
  flawSentenceIdx: z.number().int().nonnegative().nullable(),
  flawSummary: z.string().nullable(),
  correction: z.string().nullable(),
  explanation: z.string(),
})
export const TransferAnswerKey = z.object({ modelSolution: z.string(), explanation: z.string() })
export const AnswerKeyByKind = {
  diagnostic_mcq: McqAnswerKey,
  spot_flaw: SpotFlawAnswerKey,
  transfer: TransferAnswerKey,
} as const
export type McqAnswerKey = z.infer<typeof McqAnswerKey>
export type SpotFlawAnswerKey = z.infer<typeof SpotFlawAnswerKey>
export type TransferAnswerKey = z.infer<typeof TransferAnswerKey>

/** Per option id: why a student might pick it. */
export const DistractorMeta = z.record(
  z.string(),
  z.object({ misconception: z.string(), whyWrong: z.string() }),
)
export type DistractorMeta = z.infer<typeof DistractorMeta>

/** Fixed rubric written at generation time. Each criterion is scored 0..max (usually 2). */
export const RubricSecret = z.object({
  criteria: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        max: z.number().int().positive(),
      }),
    )
    .min(1),
})
export type RubricSecret = z.infer<typeof RubricSecret>

/** 2-step hint ladder: general, then specific. */
export const HintsSecret = z.tuple([z.string(), z.string()])
export type HintsSecret = z.infer<typeof HintsSecret>

// ---------- concepts.key_points (shown in the Study brief, ADR-009 amended) ----------

export const KeyPoints = z
  .array(z.object({ id: z.string(), text: z.string(), segmentIdxs: SegmentIdxs }))
  .min(2)
  .max(5)
export type KeyPoints = z.infer<typeof KeyPoints>

// ---------- 🔒 activities.rubric_snapshot ----------

export const RubricSnapshot = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), rubric: RubricSecret }),
  z.object({ kind: z.literal('key_points'), keyPoints: KeyPoints }),
])
export type RubricSnapshot = z.infer<typeof RubricSnapshot>

// ---------- lectures.chapters (F11) ----------

/**
 * One chapter, anchored to transcript segment indexes (never times: times are read from the
 * segments, so they are exact). `endIdx` is inclusive. `conceptIds` may be empty ("Q&A").
 */
/** Model-written text is capped (F11.1: a short title and one line). */
export const CHAPTER_TITLE_MAX = 80
export const CHAPTER_SUMMARY_MAX = 300

export const Chapter = z.object({
  id: z.string().min(1).max(20),
  title: z.string().min(1).max(CHAPTER_TITLE_MAX),
  summary: z.string().max(CHAPTER_SUMMARY_MAX),
  startIdx: z.number().int().nonnegative(),
  endIdx: z.number().int().nonnegative(),
  conceptIds: z.array(z.uuid()),
})
export type Chapter = z.infer<typeof Chapter>
export const Chapters = z.array(Chapter).min(1)
export type Chapters = z.infer<typeof Chapters>

// ---------- markers.target (F9.4, F11.4) ----------

/** What a study mark is on. Watch and live markers have none (they are aligned by time). */
export const StudyTarget = z.union([
  z.object({ conceptId: z.uuid() }),
  z.object({ chapterId: Chapter.shape.id }),
])
export type StudyTarget = z.infer<typeof StudyTarget>

// ---------- misc jsonb ----------

export const LectureProgress = z.object({
  step: z.string().nullable(),
  done: z.number().int(),
  total: z.number().int(),
})
export type LectureProgress = z.infer<typeof LectureProgress>
export const LectureError = z.object({ step: z.string(), code: z.string(), message: z.string() })
export type LectureError = z.infer<typeof LectureError>
export const LectureMediaJson = z.object({
  youtubeId: z.string().nullable().optional(),
  startMs: z.number().int().nullable().optional(),
  endMs: z.number().int().nullable().optional(),
  localFileName: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
  /** Official CS50 MP3 fallback if the YouTube embed is blocked (Architecture risk 7). */
  fallbackAudioUrl: z.string().nullable().optional(),
})
export type LectureMediaJson = z.infer<typeof LectureMediaJson>

export const CourseAttributionJson = z.object({
  source: z.string(),
  license: z.string(),
  url: z.string(),
  adaptedBy: z.string(),
})
export type CourseAttributionJson = z.infer<typeof CourseAttributionJson>

export const MessageGuard = z.object({
  regexHit: z.boolean(),
  jev: z
    .object({
      revealsLocation: z.number(),
      revealsCorrection: z.number(),
      maxP: z.number(),
      latencyMs: z.number(),
    })
    .nullable(),
  escalated: z.boolean(),
  escalationVerdict: z.boolean().nullable(),
  regenerated: z.boolean(),
})
export type MessageGuard = z.infer<typeof MessageGuard>

/** Stump the AI referee result (F4d, API Spec §7), stored in attempts.grading.stump. */
export const StumpResult = z.object({
  valid: z.boolean(),
  rejectionReason: z.string().nullable(),
  aiAnswer: z.string().nullable(),
  aiStumped: z.boolean(),
  refereeNotes: z.string(),
  groundedIn: z.enum(['lecture', 'course_knowledge']),
})
export type StumpResult = z.infer<typeof StumpResult>

export const AttemptGrading = z.object({
  checks: z.object({ verdict: z.boolean(), location: z.boolean().nullable() }).nullable(),
  criteria: z.array(
    z.object({ id: z.string(), label: z.string(), score: z.number(), max: z.number() }),
  ),
  rationale: z.string().nullable(),
  misconceptions: z.array(z.string()).optional(),
  /** Socratic guiding question returned with this try. */
  guidingQuestion: z.string().nullable().optional(),
  /** Stump only. */
  stump: StumpResult.optional(),
  /** The try's own grounding (e.g. stump referee citations), so a replay returns the same links. */
  sources: z.array(SourceRef).optional(),
})
export type AttemptGrading = z.infer<typeof AttemptGrading>

export const ItemVerification = z.object({
  verdict: z.enum(['pass', 'fail']),
  solvedAnswer: z.string().nullable(),
  reasons: z.array(z.string()),
  model: z.string(),
})
export type ItemVerification = z.infer<typeof ItemVerification>
