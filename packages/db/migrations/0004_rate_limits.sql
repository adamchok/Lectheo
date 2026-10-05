CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
-- Server-only like every other table (0001_security): RLS with no policies = deny-all.
ALTER TABLE "rate_limits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Defense in depth (security audit rows 5/6): the Data API roles get no table privileges and may
-- not call the sample functions (0002 only revoked them from PUBLIC). Skipped where the roles
-- don't exist (PGlite tests).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE rate_limits FROM anon, authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION clone_sample(uuid, uuid), reset_sample(uuid), purge_sample_accounts(interval) FROM anon, authenticated';
  END IF;
END $$;
