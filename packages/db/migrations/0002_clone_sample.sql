-- Sample accounts (Data Model §3, ADR-014).
-- clone_sample copies the seed student's per-user rows to a new user in ONE statement:
-- data-modifying CTEs + materialized id maps. FK checks fire at end of statement, so rows that
-- reference each other (markers ↔ marker_concepts, sessions ↔ responses ↔ attempts,
-- activities ↔ messages ↔ attempts) are inserted together and remapped through the maps.
-- ponytail: new ids use gen_random_uuid() (v4). App-generated ids are v7, but nothing depends on
-- id ordering for these rows (ordering uses created_at).
-- ponytail: timestamps are copied verbatim, so the copy looks exactly like the seed's history.
CREATE OR REPLACE FUNCTION clone_sample(seed_id uuid, new_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = seed_id AND kind = 'seed') THEN
    RAISE EXCEPTION 'clone_sample: % is not a seed profile', seed_id;
  END IF;

  WITH
  marker_map AS MATERIALIZED (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM markers WHERE user_id = seed_id AND deleted_at IS NULL
  ),
  session_map AS MATERIALIZED (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM diagnostic_sessions WHERE user_id = seed_id
  ),
  activity_map AS MATERIALIZED (
    SELECT id AS old_id, gen_random_uuid() AS new_id
    FROM activities WHERE user_id = seed_id
  ),
  ins_markers AS (
    INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture, deleted_at, created_at)
    SELECT mm.new_id, m.lecture_id, new_user, m.kind, m.t_ms, m.capture, NULL, m.created_at
    FROM markers m JOIN marker_map mm ON mm.old_id = m.id
  ),
  ins_marker_concepts AS (
    INSERT INTO marker_concepts (marker_id, concept_id, overlap_score)
    SELECT mm.new_id, mc.concept_id, mc.overlap_score
    FROM marker_concepts mc JOIN marker_map mm ON mm.old_id = mc.marker_id
  ),
  ins_sessions AS (
    INSERT INTO diagnostic_sessions
      (id, user_id, lecture_id, planned_item_ids, follow_ups_used, status, created_at, completed_at)
    SELECT sm.new_id, new_user, s.lecture_id, s.planned_item_ids, s.follow_ups_used, s.status,
           s.created_at, s.completed_at
    FROM diagnostic_sessions s JOIN session_map sm ON sm.old_id = s.id
  ),
  ins_responses AS (
    INSERT INTO diagnostic_responses
      (session_id, item_id, is_follow_up, confidence, options_revealed_at, option_id, correct,
       answered_at)
    SELECT sm.new_id, r.item_id, r.is_follow_up, r.confidence, r.options_revealed_at, r.option_id,
           r.correct, r.answered_at
    FROM diagnostic_responses r JOIN session_map sm ON sm.old_id = r.session_id
  ),
  ins_activities AS (
    INSERT INTO activities
      (id, user_id, concept_id, type, item_id, persona, status, turns_used, turn_budget,
       hints_used, explanation_shown, rubric_snapshot, created_at)
    SELECT am.new_id, new_user, a.concept_id, a.type, a.item_id, a.persona, a.status,
           a.turns_used, a.turn_budget, a.hints_used, a.explanation_shown, a.rubric_snapshot,
           a.created_at
    FROM activities a JOIN activity_map am ON am.old_id = a.id
  ),
  ins_messages AS (
    INSERT INTO messages (id, activity_id, role, content, visible, guard, created_at)
    SELECT gen_random_uuid(), am.new_id, msg.role, msg.content, msg.visible, msg.guard,
           msg.created_at
    FROM messages msg JOIN activity_map am ON am.old_id = msg.activity_id
  )
  INSERT INTO attempts
    (id, user_id, concept_id, activity_type, activity_id, diagnostic_session_id, item_id, try_no,
     final, confidence, response, grading, score, max_score, outcome, assisted, judge_model,
     created_at)
  SELECT gen_random_uuid(), new_user, t.concept_id, t.activity_type, am.new_id, sm.new_id,
         t.item_id, t.try_no, t.final, t.confidence, t.response, t.grading, t.score, t.max_score,
         t.outcome, t.assisted, t.judge_model, t.created_at
  FROM attempts t
  LEFT JOIN activity_map am ON am.old_id = t.activity_id
  LEFT JOIN session_map sm ON sm.old_id = t.diagnostic_session_id
  WHERE t.user_id = seed_id;
END $$;
--> statement-breakpoint
-- Deletes every per-user row of a sample account (keeps the profile and usage_counters, so a
-- reset can't be used to dodge daily quotas). Personal courses cascade to their lectures.
-- ponytail: Storage objects of a deleted personal course are not removed here (audio is already
-- deleted after transcription; leftover transcript files are tiny ≤ 2 MB orphans).
CREATE OR REPLACE FUNCTION reset_sample(target_user uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = target_user AND kind = 'sample') THEN
    RAISE EXCEPTION 'reset_sample: % is not a sample profile', target_user;
  END IF;
  DELETE FROM attempts WHERE user_id = target_user;
  DELETE FROM activities WHERE user_id = target_user;          -- cascades messages
  DELETE FROM diagnostic_sessions WHERE user_id = target_user; -- cascades responses
  DELETE FROM markers WHERE user_id = target_user;             -- cascades marker_concepts
  DELETE FROM courses WHERE owner_id = target_user;            -- cascades lectures etc.
END $$;
--> statement-breakpoint
-- Daily purge (Architecture §4.1): deletes sample profiles older than the interval. FKs cascade
-- every per-user row. Returns the ids so the caller can delete the auth users too.
CREATE OR REPLACE FUNCTION purge_sample_accounts(older_than interval) RETURNS SETOF uuid
LANGUAGE sql AS $$
  DELETE FROM profiles WHERE kind = 'sample' AND created_at < now() - older_than RETURNING id
$$;
--> statement-breakpoint
-- Functions are EXECUTE-able by PUBLIC by default; only the server role may call these.
REVOKE ALL ON FUNCTION clone_sample(uuid, uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION reset_sample(uuid) FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION purge_sample_accounts(interval) FROM PUBLIC;
