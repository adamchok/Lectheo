import { beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, type TestDb } from '../testing'

const SEED = '00000000-0000-4000-8000-000000000001'
const USER = '00000000-0000-4000-8000-000000000002'
const COURSE = '00000000-0000-4000-8000-0000000000c1'
const LECTURE = '00000000-0000-4000-8000-0000000000a1'
const CONCEPT = '00000000-0000-4000-8000-0000000000d1'
const ITEM_MCQ = '00000000-0000-4000-8000-0000000000e1'
const ITEM_FLAW = '00000000-0000-4000-8000-0000000000e2'
const MARKER = '00000000-0000-4000-8000-0000000000f1'
const MARKER_DELETED = '00000000-0000-4000-8000-0000000000f2'
const SESSION = '00000000-0000-4000-8000-0000000000b1'
const ACTIVITY = '00000000-0000-4000-8000-0000000000b2'

const FIXTURE = `
INSERT INTO profiles (id, kind, display_name) VALUES
  ('${SEED}', 'seed', 'Seed student'),
  ('${USER}', 'sample', 'Sample student');
INSERT INTO courses (id, owner_id, kind, title) VALUES ('${COURSE}', NULL, 'library', 'CS50x');
INSERT INTO lectures (id, course_id, title, seq, source, status)
  VALUES ('${LECTURE}', '${COURSE}', 'Lecture 4', 4, 'library', 'ready');
INSERT INTO concepts (id, course_id, name, canonical_key, summary, key_points)
  VALUES ('${CONCEPT}', '${COURSE}', 'Pointers', 'pointers', 'Addresses.', '[]');
INSERT INTO items (id, concept_id, lecture_id, kind, variant, status, public_payload, segment_idxs,
                   prompt_version, model) VALUES
  ('${ITEM_MCQ}', '${CONCEPT}', '${LECTURE}', 'diagnostic_mcq', 1, 'verified', '{}', '{1}', 'v1', 'm'),
  ('${ITEM_FLAW}', '${CONCEPT}', '${LECTURE}', 'spot_flaw', 1, 'verified', '{}', '{1}', 'v1', 'm');
INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture, deleted_at) VALUES
  ('${MARKER}', '${LECTURE}', '${SEED}', 'lost', 1000, 'watch', NULL),
  ('${MARKER_DELETED}', '${LECTURE}', '${SEED}', 'lost', 2000, 'watch', now());
INSERT INTO marker_concepts (marker_id, concept_id, overlap_score)
  VALUES ('${MARKER}', '${CONCEPT}', 0.8);
INSERT INTO diagnostic_sessions (id, user_id, lecture_id, planned_item_ids, status)
  VALUES ('${SESSION}', '${SEED}', '${LECTURE}', '{${ITEM_MCQ}}', 'completed');
INSERT INTO diagnostic_responses (session_id, item_id, confidence, option_id, correct)
  VALUES ('${SESSION}', '${ITEM_MCQ}', 'sure', 'b', false);
INSERT INTO activities (id, user_id, concept_id, type, item_id, status, turns_used)
  VALUES ('${ACTIVITY}', '${SEED}', '${CONCEPT}', 'spot_flaw', '${ITEM_FLAW}', 'closed', 2);
INSERT INTO messages (id, activity_id, role, content) VALUES
  (gen_random_uuid(), '${ACTIVITY}', 'student', 'Why?'),
  (gen_random_uuid(), '${ACTIVITY}', 'persona', 'Because.');
INSERT INTO attempts (id, user_id, concept_id, activity_type, diagnostic_session_id, item_id,
                      confidence, response, grading, score, max_score, outcome) VALUES
  (gen_random_uuid(), '${SEED}', '${CONCEPT}', 'diagnostic', '${SESSION}', '${ITEM_MCQ}', 'sure',
   '{}', '{}', 0, 1, 'incorrect');
INSERT INTO attempts (id, user_id, concept_id, activity_type, activity_id, item_id, try_no,
                      response, grading, score, max_score, outcome) VALUES
  (gen_random_uuid(), '${SEED}', '${CONCEPT}', 'spot_flaw', '${ACTIVITY}', '${ITEM_FLAW}', 1,
   '{}', '{}', 3, 6, 'partial'),
  (gen_random_uuid(), '${SEED}', '${CONCEPT}', 'spot_flaw', '${ACTIVITY}', '${ITEM_FLAW}', 2,
   '{}', '{}', 6, 6, 'correct');
`

type Row = Record<string, unknown>

async function rows(db: TestDb, query: string, params: unknown[] = []): Promise<Row[]> {
  return (await db.$client.query<Row>(query, params)).rows
}

const perUserCounts = async (db: TestDb, userId: string) => {
  const [r] = await rows(
    db,
    `SELECT
       (SELECT count(*) FROM markers WHERE user_id = $1)::int AS markers,
       (SELECT count(*) FROM marker_concepts mc JOIN markers m ON m.id = mc.marker_id
          WHERE m.user_id = $1)::int AS marker_concepts,
       (SELECT count(*) FROM diagnostic_sessions WHERE user_id = $1)::int AS sessions,
       (SELECT count(*) FROM diagnostic_responses r JOIN diagnostic_sessions s ON s.id = r.session_id
          WHERE s.user_id = $1)::int AS responses,
       (SELECT count(*) FROM activities WHERE user_id = $1)::int AS activities,
       (SELECT count(*) FROM messages msg JOIN activities a ON a.id = msg.activity_id
          WHERE a.user_id = $1)::int AS messages,
       (SELECT count(*) FROM attempts WHERE user_id = $1)::int AS attempts`,
    [userId],
  )
  return r
}

describe('clone_sample / reset_sample / purge_sample_accounts', () => {
  let db: TestDb

  beforeEach(async () => {
    db = await createTestDb()
    await db.$client.exec(FIXTURE)
  })

  it('copies the seed rows to the new user with new ids and remapped FKs', async () => {
    const before = await rows(db, `SELECT * FROM attempts WHERE user_id = $1 ORDER BY id`, [SEED])

    await db.$client.query(`SELECT clone_sample($1, $2)`, [SEED, USER])

    expect(await perUserCounts(db, USER)).toEqual({
      markers: 1, // the soft-deleted marker is not copied
      marker_concepts: 1,
      sessions: 1,
      responses: 1,
      activities: 1,
      messages: 2,
      attempts: 3,
    })

    const [marker] = await rows(db, `SELECT id FROM markers WHERE user_id = $1`, [USER])
    const [session] = await rows(db, `SELECT id FROM diagnostic_sessions WHERE user_id = $1`, [
      USER,
    ])
    const [activity] = await rows(db, `SELECT id FROM activities WHERE user_id = $1`, [USER])
    expect(marker?.id).not.toBe(MARKER)
    expect(session?.id).not.toBe(SESSION)
    expect(activity?.id).not.toBe(ACTIVITY)

    const [mc] = await rows(db, `SELECT mc.* FROM marker_concepts mc WHERE mc.marker_id = $1`, [
      marker?.id,
    ])
    expect(mc?.concept_id).toBe(CONCEPT)

    const [resp] = await rows(db, `SELECT * FROM diagnostic_responses WHERE session_id = $1`, [
      session?.id,
    ])
    expect(resp).toMatchObject({ item_id: ITEM_MCQ, confidence: 'sure', option_id: 'b' })

    const copied = await rows(
      db,
      `SELECT * FROM attempts WHERE user_id = $1 ORDER BY activity_type, try_no`,
      [USER],
    )
    const diag = copied.find((a) => a.activity_type === 'diagnostic')
    expect(diag?.diagnostic_session_id).toBe(session?.id)
    expect(diag?.activity_id).toBeNull()
    const practice = copied.filter((a) => a.activity_type === 'spot_flaw')
    expect(practice.map((a) => a.activity_id)).toEqual([activity?.id, activity?.id])
    expect(practice.map((a) => a.diagnostic_session_id)).toEqual([null, null])
    const seedIds = new Set(before.map((a) => a.id))
    expect(copied.some((a) => seedIds.has(a.id))).toBe(false)

    const msgs = await rows(db, `SELECT activity_id FROM messages WHERE activity_id = $1`, [
      activity?.id,
    ])
    expect(msgs).toHaveLength(2)

    // Seed rows are untouched.
    expect(await perUserCounts(db, SEED)).toEqual({
      markers: 2,
      marker_concepts: 1,
      sessions: 1,
      responses: 1,
      activities: 1,
      messages: 2,
      attempts: 3,
    })
    expect(await rows(db, `SELECT * FROM attempts WHERE user_id = $1 ORDER BY id`, [SEED])).toEqual(
      before,
    )
  })

  it('refuses a non-seed source profile', async () => {
    await expect(db.$client.query(`SELECT clone_sample($1, $2)`, [USER, SEED])).rejects.toThrow(
      /not a seed profile/,
    )
  })

  it('reset_sample deletes only the user rows, and a re-clone works', async () => {
    await db.$client.query(`SELECT clone_sample($1, $2)`, [SEED, USER])
    await db.$client.query(`SELECT reset_sample($1)`, [USER])
    const empty = await perUserCounts(db, USER)
    expect(Object.values(empty ?? {}).every((n) => n === 0)).toBe(true)
    expect((await perUserCounts(db, SEED))?.attempts).toBe(3)

    await db.$client.query(`SELECT clone_sample($1, $2)`, [SEED, USER])
    expect((await perUserCounts(db, USER))?.attempts).toBe(3)
  })

  it('reset_sample refuses non-sample profiles (protects the seed)', async () => {
    await expect(db.$client.query(`SELECT reset_sample($1)`, [SEED])).rejects.toThrow(
      /not a sample profile/,
    )
  })

  it('purge_sample_accounts deletes old sample profiles with their rows', async () => {
    await db.$client.query(`SELECT clone_sample($1, $2)`, [SEED, USER])
    const fresh = await rows(db, `SELECT purge_sample_accounts('24 hours') AS id`)
    expect(fresh).toEqual([])

    await db.$client.query(`UPDATE profiles SET created_at = now() - interval '2 days'`)
    const purged = await rows(db, `SELECT purge_sample_accounts('24 hours') AS id`)
    expect(purged.map((r) => r.id)).toEqual([USER])
    expect((await perUserCounts(db, USER))?.attempts).toBe(0)
    expect((await perUserCounts(db, SEED))?.attempts).toBe(3)
  })
})
