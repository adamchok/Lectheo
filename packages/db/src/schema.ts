import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  ACTIVITY_STATUSES,
  ACTIVITY_TYPES,
  ASSET_KINDS,
  ASSET_STATUSES,
  ATTEMPT_ACTIVITY_TYPES,
  CONFIDENCE_LEVELS,
  COURSE_KINDS,
  ITEM_KINDS,
  ITEM_STATUSES,
  LECTURE_SOURCES,
  LECTURE_STATUSES,
  LLM_OUTCOMES,
  MARKER_CAPTURES,
  MARKER_KINDS,
  MESSAGE_ROLES,
  OUTCOMES,
  PROFILE_KINDS,
  RELATIONS,
  SESSION_STATUSES,
  STEP_STATUSES,
  USAGE_METRICS,
  type AttemptGrading,
  type Chapters,
  type CourseAttributionJson,
  type DistractorMeta,
  type HintsSecret,
  type ItemVerification,
  type ConceptDepth,
  type KeyPoints,
  type LectureError,
  type LectureMediaJson,
  type LectureProgress,
  type MessageGuard,
  type RubricSecret,
  type RubricSnapshot,
  type StudyTarget,
} from '@lectheo/contracts'
import { uuidv7 } from './ids'

/*
 * Data Model v2. Conventions:
 * - uuid v7 PKs generated in the app; clients send ids for created resources (ON CONFLICT DO NOTHING).
 * - Times inside a lecture are integer ms of media time.
 * - RLS deny-all + Data API off (see migrations/*_security.sql). The server is the only reader.
 * - 🔒 columns/tables are server-only: never select them into a client DTO.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const tsz = (name: string) => timestamp(name, { withTimezone: true })

// ---------- enums ----------
export const profileKind = pgEnum('profile_kind', PROFILE_KINDS)
export const courseKind = pgEnum('course_kind', COURSE_KINDS)
export const lectureSource = pgEnum('lecture_source', LECTURE_SOURCES)
export const lectureStatus = pgEnum('lecture_status', LECTURE_STATUSES)
export const assetKind = pgEnum('asset_kind', ASSET_KINDS)
export const assetStatus = pgEnum('asset_status', ASSET_STATUSES)
export const stepStatus = pgEnum('step_status', STEP_STATUSES)
export const markerKind = pgEnum('marker_kind', MARKER_KINDS)
export const markerCapture = pgEnum('marker_capture', MARKER_CAPTURES)
export const relation = pgEnum('relation', RELATIONS)
export const itemKind = pgEnum('item_kind', ITEM_KINDS)
export const itemStatus = pgEnum('item_status', ITEM_STATUSES)
export const sessionStatus = pgEnum('session_status', SESSION_STATUSES)
export const confidence = pgEnum('confidence', CONFIDENCE_LEVELS)
export const activityType = pgEnum('activity_type', ACTIVITY_TYPES)
export const activityStatus = pgEnum('activity_status', ACTIVITY_STATUSES)
export const messageRole = pgEnum('message_role', MESSAGE_ROLES)
export const attemptActivityType = pgEnum('attempt_activity_type', ATTEMPT_ACTIVITY_TYPES)
export const outcome = pgEnum('outcome', OUTCOMES)
export const llmOutcome = pgEnum('llm_outcome', LLM_OUTCOMES)
export const usageMetric = pgEnum('usage_metric', USAGE_METRICS)

// ---------- identity ----------

/** 1:1 with auth.users. Created lazily by the server auth helper (no trigger). */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  kind: profileKind('kind').notNull(),
  displayName: text('display_name'),
  seededFrom: uuid('seeded_from'),
  timezone: text('timezone').notNull().default('UTC'),
  createdAt: createdAt(),
})

// ---------- courses and lectures ----------

export const courses = pgTable(
  'courses',
  {
    id: id(),
    ownerId: uuid('owner_id').references(() => profiles.id, { onDelete: 'cascade' }),
    kind: courseKind('kind').notNull(),
    title: text('title').notNull(),
    attribution: jsonb('attribution').$type<CourseAttributionJson>(),
    layout: jsonb('layout').$type<Record<string, { x: number; y: number }>>(),
    layoutHash: text('layout_hash'),
    createdAt: createdAt(),
  },
  (t) => [
    index('courses_owner_idx').on(t.ownerId),
    check('courses_library_has_no_owner', sql`(${t.kind} = 'library') = (${t.ownerId} IS NULL)`),
  ],
)

export const lectures = pgTable(
  'lectures',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    seq: integer('seq').notNull(),
    source: lectureSource('source').notNull(),
    status: lectureStatus('status').notNull().default('draft'),
    progress: jsonb('progress').$type<LectureProgress>(),
    media: jsonb('media').$type<LectureMediaJson>(),
    hasTimestamps: boolean('has_timestamps').notNull().default(true),
    audioPath: text('audio_path'),
    durationMs: integer('duration_ms'),
    sttJobId: text('stt_job_id'),
    sttConfidence: real('stt_confidence'),
    workflowRunId: text('workflow_run_id'),
    needsReprocess: boolean('needs_reprocess').notNull().default(false),
    error: jsonb('error').$type<LectureError>(),
    /** F11: segment-index chapters from extractConcepts; null without timestamps. */
    chapters: jsonb('chapters').$type<Chapters>(),
    createdAt: createdAt(),
    updatedAt: tsz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('lectures_course_seq_idx').on(t.courseId, t.seq),
    // "One processing lecture per course" (closes the double-/process and dedupe races).
    uniqueIndex('lectures_one_processing_per_course')
      .on(t.courseId)
      .where(sql`${t.status} = 'processing'`),
  ],
)

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    /** Prompts cite segments as [s42] → (lecture_id, 42). Edits never re-segment. */
    idx: integer('idx').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    editedText: text('edited_text'),
  },
  (t) => [primaryKey({ columns: [t.lectureId, t.idx] })],
)

export const lectureAssets = pgTable(
  'lecture_assets',
  {
    id: id(),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    kind: assetKind('kind').notNull(),
    storagePath: text('storage_path'),
    extractedText: text('extracted_text'),
    status: assetStatus('status').notNull().default('pending'),
  },
  (t) => [index('lecture_assets_lecture_idx').on(t.lectureId)],
)

export const pipelineSteps = pgTable(
  'pipeline_steps',
  {
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    step: text('step').notNull(),
    status: stepStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /** Small results and ids only, never transcripts. */
    output: jsonb('output'),
    updatedAt: tsz('updated_at')
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.lectureId, t.step] })],
)

export const markers = pgTable(
  'markers',
  {
    id: uuid('id').primaryKey(), // client-generated
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: markerKind('kind').notNull(),
    tMs: integer('t_ms').notNull(),
    capture: markerCapture('capture').notNull(),
    /** Study marks: `{ conceptId }` or `{ chapterId }`, so a re-run re-links them by rule. */
    target: jsonb('target').$type<StudyTarget>(),
    deletedAt: tsz('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('markers_lecture_user_idx').on(t.lectureId, t.userId)],
)

// ---------- concept graph (per course) ----------

export const concepts = pgTable(
  'concepts',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    canonicalKey: text('canonical_key').notNull(),
    summary: text('summary').notNull(),
    /** Shown in the Study brief (ADR-009 amended); frozen into rubric_snapshot for teach-back. */
    keyPoints: jsonb('key_points').$type<KeyPoints>().notNull(),
    /** F9.13 "Explain in depth" (not secret); written by explainConcepts for its first lecture. */
    depth: jsonb('depth').$type<ConceptDepth>(),
    firstLectureId: uuid('first_lecture_id').references(() => lectures.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('concepts_course_idx').on(t.courseId),
    unique('concepts_course_canonical_key').on(t.courseId, t.canonicalKey),
  ],
)

export const markerConcepts = pgTable(
  'marker_concepts',
  {
    markerId: uuid('marker_id')
      .notNull()
      .references(() => markers.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    overlapScore: real('overlap_score').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.markerId, t.conceptId] }),
    index('marker_concepts_concept_idx').on(t.conceptId),
  ],
)

export const conceptOccurrences = pgTable(
  'concept_occurrences',
  {
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    segmentIdxs: integer('segment_idxs').array().notNull(),
    salience: real('salience').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptId, t.lectureId] }),
    index('concept_occurrences_lecture_idx').on(t.lectureId),
  ],
)

export const conceptEdges = pgTable(
  'concept_edges',
  {
    id: id(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    fromConceptId: uuid('from_concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    toConceptId: uuid('to_concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    relation: relation('relation').notNull(),
    lectureId: uuid('lecture_id').references(() => lectures.id, { onDelete: 'set null' }),
    segmentIdxs: integer('segment_idxs').array().notNull(),
  },
  (t) => [
    index('concept_edges_course_idx').on(t.courseId),
    index('concept_edges_to_idx').on(t.toConceptId),
    unique('concept_edges_from_to_relation').on(t.fromConceptId, t.toConceptId, t.relation),
    check('concept_edges_no_self', sql`${t.fromConceptId} <> ${t.toConceptId}`),
  ],
)

// ---------- assessment content ----------

export const items = pgTable(
  'items',
  {
    id: id(),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    kind: itemKind('kind').notNull(),
    variant: integer('variant').notNull(),
    status: itemStatus('status').notNull().default('draft'),
    /** The only part clients see (validate with PublicPayloadByKind[kind]). */
    publicPayload: jsonb('public_payload').notNull(),
    segmentIdxs: integer('segment_idxs').array().notNull(),
    verification: jsonb('verification').$type<ItemVerification>(),
    promptVersion: text('prompt_version').notNull(),
    model: text('model').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('items_concept_kind_status_idx').on(t.conceptId, t.kind, t.status),
    index('items_lecture_idx').on(t.lectureId),
  ],
)

/** 🔒 Separate table for defense in depth. */
export const itemSecrets = pgTable('item_secrets', {
  itemId: uuid('item_id')
    .primaryKey()
    .references(() => items.id, { onDelete: 'cascade' }),
  /** Validate with AnswerKeyByKind[item.kind]. */
  answerKey: jsonb('answer_key').notNull(),
  distractorMeta: jsonb('distractor_meta').$type<DistractorMeta>(),
  rubric: jsonb('rubric').$type<RubricSecret>(),
  hints: jsonb('hints').$type<HintsSecret>(),
  leakKeywords: text('leak_keywords')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
})

// ---------- learner activity ----------

export const diagnosticSessions = pgTable(
  'diagnostic_sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    plannedItemIds: uuid('planned_item_ids').array().notNull(),
    followUpsUsed: integer('follow_ups_used').notNull().default(0),
    status: sessionStatus('status').notNull().default('active'),
    createdAt: createdAt(),
    completedAt: tsz('completed_at'),
  },
  (t) => [
    index('diagnostic_sessions_user_lecture_idx').on(t.userId, t.lectureId),
    uniqueIndex('diagnostic_sessions_one_active')
      .on(t.userId, t.lectureId)
      .where(sql`${t.status} = 'active'`),
  ],
)

export const diagnosticResponses = pgTable(
  'diagnostic_responses',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    isFollowUp: boolean('is_follow_up').notNull().default(false),
    /** Set exactly once; the confidence endpoint is the only one that reveals options. */
    confidence: confidence('confidence').notNull(),
    optionsRevealedAt: tsz('options_revealed_at').notNull().defaultNow(),
    /** Set exactly once: guarded update WHERE option_id IS NULL. */
    optionId: text('option_id'),
    correct: boolean('correct'),
    answeredAt: tsz('answered_at'),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.itemId] }),
    index('diagnostic_responses_item_idx').on(t.itemId),
  ],
)

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey(), // client-generated
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    type: activityType('type').notNull(),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'cascade' }),
    persona: text('persona'),
    status: activityStatus('status').notNull().default('active'),
    turnsUsed: integer('turns_used').notNull().default(0),
    turnBudget: integer('turn_budget').notNull().default(6),
    hintsUsed: integer('hints_used').notNull().default(0),
    explanationShown: boolean('explanation_shown').notNull().default(false),
    /** 🔒 frozen when the activity starts. */
    rubricSnapshot: jsonb('rubric_snapshot').$type<RubricSnapshot>(),
    createdAt: createdAt(),
  },
  (t) => [
    index('activities_user_concept_idx').on(t.userId, t.conceptId),
    index('activities_item_idx').on(t.itemId),
    check('activities_turns_within_budget', sql`${t.turnsUsed} <= ${t.turnBudget}`),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: id(),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    /** false for blocked author drafts — never returned to clients. */
    visible: boolean('visible').notNull().default(true),
    guard: jsonb('guard').$type<MessageGuard>(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_activity_created_idx').on(t.activityId, t.createdAt)],
)

/** Every graded answer. Mastery is computed on read from this table (ADR-008). */
export const attempts = pgTable(
  'attempts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    activityType: attemptActivityType('activity_type').notNull(),
    activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'cascade' }),
    diagnosticSessionId: uuid('diagnostic_session_id').references(() => diagnosticSessions.id, {
      onDelete: 'cascade',
    }),
    itemId: uuid('item_id').references(() => items.id, { onDelete: 'cascade' }),
    tryNo: integer('try_no').notNull().default(1),
    final: boolean('final').notNull().default(true),
    confidence: confidence('confidence'),
    response: jsonb('response').notNull(),
    grading: jsonb('grading').$type<AttemptGrading>().notNull(),
    score: numeric('score', { mode: 'number' }).notNull(),
    maxScore: numeric('max_score', { mode: 'number' }).notNull(),
    outcome: outcome('outcome').notNull(),
    assisted: boolean('assisted').notNull().default(false),
    judgeModel: text('judge_model'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('attempts_activity_try').on(t.activityId, t.tryNo),
    unique('attempts_session_item').on(t.diagnosticSessionId, t.itemId),
    index('attempts_user_concept_created_idx').on(t.userId, t.conceptId, t.createdAt),
    index('attempts_item_idx').on(t.itemId),
  ],
)

// ---------- platform ----------

export const llmCalls = pgTable(
  'llm_calls',
  {
    id: id(),
    userId: uuid('user_id'),
    lectureId: uuid('lecture_id'),
    task: text('task').notNull(),
    role: text('role').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    /**
     * Who paid for the call: AI Gateway keys 'dev' | 'prod' (the governor sums 'prod' only), or
     * 'google' for the direct Google key (the transcriber, capped by GOOGLE_AI_BUDGET_USD).
     */
    gatewayKey: text('gateway_key').notNull().default('prod'),
    inputTokens: integer('input_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 10, scale: 6, mode: 'number' }).notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    outcome: llmOutcome('outcome').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('llm_calls_created_idx').on(t.createdAt)],
)

export const usageCounters = pgTable(
  'usage_counters',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    metric: usageMetric('metric').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.metric] })],
)

/** Single row (id = 1), set by the spend governor. */
export const appFlags = pgTable(
  'app_flags',
  {
    id: integer('id').primaryKey().default(1),
    aiDegraded: boolean('ai_degraded').notNull().default(false),
    intakePaused: boolean('intake_paused').notNull().default(false),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [check('app_flags_single_row', sql`${t.id} = 1`)],
)

/** Fixed-window request counters (per-IP limit on sample sign-in). Server-only, RLS deny-all. */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: text('key').notNull(),
    windowStart: tsz('window_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
)

/**
 * F10.6: transcripts of public YouTube videos, shared across students (a public video's
 * transcript is not personal data), keyed by the model and prompt that made them. Cues are
 * validated and stitched. `refusal` caches a negative verdict (`no_speech`, `not_english`, with
 * empty cues) so the same video is refused before any spend. Server-only, RLS deny-all.
 */
export const youtubeTranscripts = pgTable(
  'youtube_transcripts',
  {
    videoId: text('video_id').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    durationMs: integer('duration_ms').notNull(),
    cues: jsonb('cues').$type<{ startMs: number; endMs: number; text: string }[]>().notNull(),
    refusal: text('refusal'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.model, t.promptVersion] })],
)

/**
 * F10.5: each finished 2-minute chunk of a transcription in progress, so a step that dies or a
 * Retry never pays for finished chunks again. Deleted once the transcript (or its refusal) is
 * cached. `attempts` counts the one retry of a bad chunk. Server-only, RLS deny-all.
 */
export const youtubeTranscriptChunks = pgTable(
  'youtube_transcript_chunks',
  {
    videoId: text('video_id').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    cues: jsonb('cues').$type<{ startMs: number; endMs: number; text: string }[]>().notNull(),
    attempts: integer('attempts').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.videoId, t.model, t.promptVersion, t.startMs, t.endMs] })],
)
