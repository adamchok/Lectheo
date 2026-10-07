-- F10 YouTube lectures. Written to re-run cleanly: an earlier draft of 0007 (video_id-only key)
-- reached local development databases, never production. The cache only ever held test rows.
ALTER TYPE "public"."lecture_source" ADD VALUE IF NOT EXISTS 'youtube';--> statement-breakpoint
DROP TABLE IF EXISTS "youtube_transcript_chunks";
--> statement-breakpoint
CREATE TABLE "youtube_transcript_chunks" (
	"video_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"cues" jsonb NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_transcript_chunks_video_id_model_prompt_version_start_ms_end_ms_pk" PRIMARY KEY("video_id","model","prompt_version","start_ms","end_ms")
);
--> statement-breakpoint
DROP TABLE IF EXISTS "youtube_transcripts";
--> statement-breakpoint
CREATE TABLE "youtube_transcripts" (
	"video_id" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"cues" jsonb NOT NULL,
	"refusal" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "youtube_transcripts_video_id_model_prompt_version_pk" PRIMARY KEY("video_id","model","prompt_version")
);
--> statement-breakpoint
-- Server-only like every other table (0001_security): RLS, no policies.
ALTER TABLE "youtube_transcripts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "youtube_transcript_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Defense in depth, as in 0004: the Data API roles get no table privileges. Skipped where the
-- roles don't exist (PGlite tests).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE youtube_transcripts, youtube_transcript_chunks FROM anon, authenticated';
  END IF;
END $$;
