ALTER TYPE "public"."lecture_source" ADD VALUE 'youtube';--> statement-breakpoint
CREATE TABLE "youtube_transcripts" (
	"video_id" text PRIMARY KEY NOT NULL,
	"duration_ms" integer NOT NULL,
	"cues" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- F10.6 transcript cache. Server-only like every other table (0001_security): RLS, no policies.
ALTER TABLE "youtube_transcripts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Defense in depth, as in 0004: the Data API roles get no table privileges. Skipped where the
-- roles don't exist (PGlite tests).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE youtube_transcripts FROM anon, authenticated';
  END IF;
END $$;
