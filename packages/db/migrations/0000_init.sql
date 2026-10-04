CREATE TYPE "public"."activity_status" AS ENUM('active', 'awaiting_retry', 'closed');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('spot_flaw', 'teach_back', 'transfer', 'stump');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('slides_pdf', 'notes_text');--> statement-breakpoint
CREATE TYPE "public"."asset_status" AS ENUM('pending', 'extracted', 'failed');--> statement-breakpoint
CREATE TYPE "public"."attempt_activity_type" AS ENUM('diagnostic', 'spot_flaw', 'teach_back', 'transfer', 'stump');--> statement-breakpoint
CREATE TYPE "public"."confidence" AS ENUM('sure', 'unsure', 'guess', 'no_idea');--> statement-breakpoint
CREATE TYPE "public"."course_kind" AS ENUM('library', 'personal');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('diagnostic_mcq', 'spot_flaw', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."item_status" AS ENUM('draft', 'verified', 'rejected', 'retired');--> statement-breakpoint
CREATE TYPE "public"."lecture_source" AS ENUM('library', 'import', 'live', 'audio', 'transcript');--> statement-breakpoint
CREATE TYPE "public"."lecture_status" AS ENUM('draft', 'uploading', 'processing', 'map_ready', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."llm_outcome" AS ENUM('ok', 'repaired', 'failed', 'quota_blocked', 'budget_blocked');--> statement-breakpoint
CREATE TYPE "public"."marker_capture" AS ENUM('watch', 'live');--> statement-breakpoint
CREATE TYPE "public"."marker_kind" AS ENUM('lost', 'important');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('student', 'persona');--> statement-breakpoint
CREATE TYPE "public"."outcome" AS ENUM('correct', 'partial', 'incorrect', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."profile_kind" AS ENUM('google', 'sample', 'seed', 'owner');--> statement-breakpoint
CREATE TYPE "public"."relation" AS ENUM('depends_on', 'is_a', 'part_of', 'contrasts_with', 'causes', 'example_of');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."usage_metric" AS ENUM('lectures', 'reprocess', 'llm_tasks', 'activities');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"type" "activity_type" NOT NULL,
	"item_id" uuid,
	"persona" text,
	"status" "activity_status" DEFAULT 'active' NOT NULL,
	"turns_used" integer DEFAULT 0 NOT NULL,
	"turn_budget" integer DEFAULT 6 NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"explanation_shown" boolean DEFAULT false NOT NULL,
	"rubric_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_turns_within_budget" CHECK ("activities"."turns_used" <= "activities"."turn_budget")
);
--> statement-breakpoint
CREATE TABLE "app_flags" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"ai_degraded" boolean DEFAULT false NOT NULL,
	"intake_paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_flags_single_row" CHECK ("app_flags"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"activity_type" "attempt_activity_type" NOT NULL,
	"activity_id" uuid,
	"diagnostic_session_id" uuid,
	"item_id" uuid,
	"try_no" integer DEFAULT 1 NOT NULL,
	"final" boolean DEFAULT true NOT NULL,
	"confidence" "confidence",
	"response" jsonb NOT NULL,
	"grading" jsonb NOT NULL,
	"score" numeric NOT NULL,
	"max_score" numeric NOT NULL,
	"outcome" "outcome" NOT NULL,
	"assisted" boolean DEFAULT false NOT NULL,
	"judge_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempts_activity_try" UNIQUE("activity_id","try_no"),
	CONSTRAINT "attempts_session_item" UNIQUE("diagnostic_session_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "concept_edges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"from_concept_id" uuid NOT NULL,
	"to_concept_id" uuid NOT NULL,
	"relation" "relation" NOT NULL,
	"lecture_id" uuid,
	"segment_idxs" integer[] NOT NULL,
	CONSTRAINT "concept_edges_from_to_relation" UNIQUE("from_concept_id","to_concept_id","relation"),
	CONSTRAINT "concept_edges_no_self" CHECK ("concept_edges"."from_concept_id" <> "concept_edges"."to_concept_id")
);
--> statement-breakpoint
CREATE TABLE "concept_occurrences" (
	"concept_id" uuid NOT NULL,
	"lecture_id" uuid NOT NULL,
	"segment_idxs" integer[] NOT NULL,
	"salience" real NOT NULL,
	CONSTRAINT "concept_occurrences_concept_id_lecture_id_pk" PRIMARY KEY("concept_id","lecture_id")
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"canonical_key" text NOT NULL,
	"summary" text NOT NULL,
	"key_points" jsonb NOT NULL,
	"first_lecture_id" uuid,
	CONSTRAINT "concepts_course_canonical_key" UNIQUE("course_id","canonical_key")
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid,
	"kind" "course_kind" NOT NULL,
	"title" text NOT NULL,
	"attribution" jsonb,
	"layout" jsonb,
	"layout_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "courses_library_has_no_owner" CHECK (("courses"."kind" = 'library') = ("courses"."owner_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "diagnostic_responses" (
	"session_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"is_follow_up" boolean DEFAULT false NOT NULL,
	"confidence" "confidence" NOT NULL,
	"options_revealed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"option_id" text,
	"correct" boolean,
	"answered_at" timestamp with time zone,
	CONSTRAINT "diagnostic_responses_session_id_item_id_pk" PRIMARY KEY("session_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "diagnostic_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"lecture_id" uuid NOT NULL,
	"planned_item_ids" uuid[] NOT NULL,
	"follow_ups_used" integer DEFAULT 0 NOT NULL,
	"status" "session_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "item_secrets" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"answer_key" jsonb NOT NULL,
	"distractor_meta" jsonb,
	"rubric" jsonb,
	"hints" jsonb,
	"leak_keywords" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"concept_id" uuid NOT NULL,
	"lecture_id" uuid NOT NULL,
	"kind" "item_kind" NOT NULL,
	"variant" integer NOT NULL,
	"status" "item_status" DEFAULT 'draft' NOT NULL,
	"public_payload" jsonb NOT NULL,
	"segment_idxs" integer[] NOT NULL,
	"verification" jsonb,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lecture_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lecture_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"storage_path" text,
	"extracted_text" text,
	"status" "asset_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lectures" (
	"id" uuid PRIMARY KEY NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"seq" integer NOT NULL,
	"source" "lecture_source" NOT NULL,
	"status" "lecture_status" DEFAULT 'draft' NOT NULL,
	"progress" jsonb,
	"media" jsonb,
	"has_timestamps" boolean DEFAULT true NOT NULL,
	"audio_path" text,
	"duration_ms" integer,
	"stt_job_id" text,
	"stt_confidence" real,
	"workflow_run_id" text,
	"needs_reprocess" boolean DEFAULT false NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"lecture_id" uuid,
	"task" text NOT NULL,
	"role" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"cached_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(10, 6) DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"outcome" "llm_outcome" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marker_concepts" (
	"marker_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"overlap_score" real NOT NULL,
	CONSTRAINT "marker_concepts_marker_id_concept_id_pk" PRIMARY KEY("marker_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "markers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"lecture_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "marker_kind" NOT NULL,
	"t_ms" integer NOT NULL,
	"capture" "marker_capture" NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"guard" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_steps" (
	"lecture_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"output" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_steps_lecture_id_step_pk" PRIMARY KEY("lecture_id","step")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "profile_kind" NOT NULL,
	"display_name" text,
	"seeded_from" uuid,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"lecture_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"edited_text" text,
	CONSTRAINT "transcript_segments_lecture_id_idx_pk" PRIMARY KEY("lecture_id","idx")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"metric" "usage_metric" NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "usage_counters_user_id_day_metric_pk" PRIMARY KEY("user_id","day","metric")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_diagnostic_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("diagnostic_session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_from_concept_id_concepts_id_fk" FOREIGN KEY ("from_concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_to_concept_id_concepts_id_fk" FOREIGN KEY ("to_concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_edges" ADD CONSTRAINT "concept_edges_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_occurrences" ADD CONSTRAINT "concept_occurrences_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_occurrences" ADD CONSTRAINT "concept_occurrences_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_first_lecture_id_lectures_id_fk" FOREIGN KEY ("first_lecture_id") REFERENCES "public"."lectures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_session_id_diagnostic_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."diagnostic_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_responses" ADD CONSTRAINT "diagnostic_responses_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnostic_sessions" ADD CONSTRAINT "diagnostic_sessions_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_secrets" ADD CONSTRAINT "item_secrets_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lecture_assets" ADD CONSTRAINT "lecture_assets_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lectures" ADD CONSTRAINT "lectures_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marker_concepts" ADD CONSTRAINT "marker_concepts_marker_id_markers_id_fk" FOREIGN KEY ("marker_id") REFERENCES "public"."markers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marker_concepts" ADD CONSTRAINT "marker_concepts_concept_id_concepts_id_fk" FOREIGN KEY ("concept_id") REFERENCES "public"."concepts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markers" ADD CONSTRAINT "markers_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "markers" ADD CONSTRAINT "markers_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "public"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_user_concept_idx" ON "activities" USING btree ("user_id","concept_id");--> statement-breakpoint
CREATE INDEX "activities_item_idx" ON "activities" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "attempts_user_concept_created_idx" ON "attempts" USING btree ("user_id","concept_id","created_at");--> statement-breakpoint
CREATE INDEX "attempts_item_idx" ON "attempts" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "concept_edges_course_idx" ON "concept_edges" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "concept_edges_to_idx" ON "concept_edges" USING btree ("to_concept_id");--> statement-breakpoint
CREATE INDEX "concept_occurrences_lecture_idx" ON "concept_occurrences" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "concepts_course_idx" ON "concepts" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "courses_owner_idx" ON "courses" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "diagnostic_responses_item_idx" ON "diagnostic_responses" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "diagnostic_sessions_user_lecture_idx" ON "diagnostic_sessions" USING btree ("user_id","lecture_id");--> statement-breakpoint
CREATE UNIQUE INDEX "diagnostic_sessions_one_active" ON "diagnostic_sessions" USING btree ("user_id","lecture_id") WHERE "diagnostic_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "items_concept_kind_status_idx" ON "items" USING btree ("concept_id","kind","status");--> statement-breakpoint
CREATE INDEX "items_lecture_idx" ON "items" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "lecture_assets_lecture_idx" ON "lecture_assets" USING btree ("lecture_id");--> statement-breakpoint
CREATE INDEX "lectures_course_seq_idx" ON "lectures" USING btree ("course_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "lectures_one_processing_per_course" ON "lectures" USING btree ("course_id") WHERE "lectures"."status" = 'processing';--> statement-breakpoint
CREATE INDEX "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "marker_concepts_concept_idx" ON "marker_concepts" USING btree ("concept_id");--> statement-breakpoint
CREATE INDEX "markers_lecture_user_idx" ON "markers" USING btree ("lecture_id","user_id");--> statement-breakpoint
CREATE INDEX "messages_activity_created_idx" ON "messages" USING btree ("activity_id","created_at");