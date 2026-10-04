-- Server-only data access (ADR-003, Data Model conventions).
-- RLS on every table with NO policies = deny-all for anon/authenticated (PostgREST).
-- The Next.js server connects as a privileged role that bypasses RLS.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '__drizzle%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
-- Defense in depth: also revoke table privileges from the Data API roles when they exist (Supabase).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;
--> statement-breakpoint
INSERT INTO app_flags (id) VALUES (1) ON CONFLICT DO NOTHING;
