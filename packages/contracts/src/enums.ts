import { z } from 'zod'

// Single source of truth for enum values. packages/db builds pgEnums from these arrays.

export const PROFILE_KINDS = ['google', 'sample', 'seed', 'owner'] as const
export const COURSE_KINDS = ['library', 'personal'] as const
/** `youtube`: a public YouTube video transcribed by Gemini (F10). */
export const LECTURE_SOURCES = ['library', 'import', 'live', 'audio', 'transcript', 'youtube'] as const
export const LECTURE_STATUSES = [
  'draft',
  'uploading',
  'processing',
  'map_ready',
  'ready',
  'failed',
] as const
export const ASSET_KINDS = ['slides_pdf', 'notes_text'] as const
export const ASSET_STATUSES = ['pending', 'extracted', 'failed'] as const
export const STEP_STATUSES = ['pending', 'running', 'done', 'failed'] as const
export const MARKER_KINDS = ['lost', 'important'] as const
/** `study`: a mark on a concept or chapter in Study mode or the Chapters tab (F9.4, F11.4). */
export const MARKER_CAPTURES = ['watch', 'live', 'study'] as const
export const RELATIONS = [
  'depends_on',
  'is_a',
  'part_of',
  'contrasts_with',
  'causes',
  'example_of',
] as const
export const ITEM_KINDS = ['diagnostic_mcq', 'spot_flaw', 'transfer'] as const
export const ITEM_STATUSES = ['draft', 'verified', 'rejected', 'retired'] as const
export const SESSION_STATUSES = ['active', 'completed'] as const
export const CONFIDENCE_LEVELS = ['sure', 'unsure', 'guess', 'no_idea'] as const
export const ACTIVITY_TYPES = ['spot_flaw', 'teach_back', 'transfer', 'stump'] as const
export const ACTIVITY_STATUSES = ['active', 'awaiting_retry', 'closed'] as const
export const MESSAGE_ROLES = ['student', 'persona'] as const
export const ATTEMPT_ACTIVITY_TYPES = ['diagnostic', ...ACTIVITY_TYPES] as const
export const OUTCOMES = ['correct', 'partial', 'incorrect', 'invalid'] as const
export const LLM_OUTCOMES = ['ok', 'repaired', 'failed', 'quota_blocked', 'budget_blocked'] as const
export const USAGE_METRICS = ['lectures', 'reprocess', 'llm_tasks', 'activities'] as const
export const MASTERY_STATES = ['gray', 'red', 'amber', 'green'] as const
export const FINDINGS = [
  'confident_mistake',
  'possible_confident_mistake',
  'possible_slip',
  'wrong',
  'unsure_right',
  'right',
] as const

/** Pipeline step enum, shared by pipeline_steps.step and POST /process?from= (Architecture §4.3). */
export const PIPELINE_STEPS = [
  'parseTranscript',
  'buildKeyterms',
  'submitTranscription',
  'pollTranscription',
  'fetchTranscript',
  'transcribeVideo',
  'segment',
  'extractConcepts',
  'validateGraph',
  'layoutMap',
  'alignMarkers',
  'draftItems',
  'verifyItems',
  /** F9.13: runs beside draftItems/verifyItems; not on the progress path. */
  'explainConcepts',
] as const
export const REPROCESS_FROM_STEPS = [
  'parseTranscript',
  'submitTranscription',
  'extractConcepts',
  'draftItems',
] as const

export const ProfileKind = z.enum(PROFILE_KINDS)
export const CourseKind = z.enum(COURSE_KINDS)
export const LectureSource = z.enum(LECTURE_SOURCES)
export const LectureStatus = z.enum(LECTURE_STATUSES)
export const MarkerKind = z.enum(MARKER_KINDS)
export const MarkerCapture = z.enum(MARKER_CAPTURES)
export const Relation = z.enum(RELATIONS)
export const ItemKind = z.enum(ITEM_KINDS)
export const ConfidenceLevel = z.enum(CONFIDENCE_LEVELS)
export const ActivityType = z.enum(ACTIVITY_TYPES)
export const ActivityStatus = z.enum(ACTIVITY_STATUSES)
export const AttemptActivityType = z.enum(ATTEMPT_ACTIVITY_TYPES)
export const Outcome = z.enum(OUTCOMES)
export const MasteryState = z.enum(MASTERY_STATES)
export const Finding = z.enum(FINDINGS)
export const PipelineStep = z.enum(PIPELINE_STEPS)
export const ReprocessFromStep = z.enum(REPROCESS_FROM_STEPS)
export const UsageMetric = z.enum(USAGE_METRICS)

export type ProfileKind = z.infer<typeof ProfileKind>
export type CourseKind = z.infer<typeof CourseKind>
export type LectureSource = z.infer<typeof LectureSource>
export type LectureStatus = z.infer<typeof LectureStatus>
export type MarkerKind = z.infer<typeof MarkerKind>
export type MarkerCapture = z.infer<typeof MarkerCapture>
export type Relation = z.infer<typeof Relation>
export type ItemKind = z.infer<typeof ItemKind>
export type ConfidenceLevel = z.infer<typeof ConfidenceLevel>
export type ActivityType = z.infer<typeof ActivityType>
export type ActivityStatus = z.infer<typeof ActivityStatus>
export type AttemptActivityType = z.infer<typeof AttemptActivityType>
export type Outcome = z.infer<typeof Outcome>
export type MasteryState = z.infer<typeof MasteryState>
export type Finding = z.infer<typeof Finding>
export type PipelineStep = z.infer<typeof PipelineStep>
export type UsageMetric = z.infer<typeof UsageMetric>
