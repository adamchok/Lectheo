import { createTestDb, type TestDb } from '@lectheo/db/testing'
import type { Actor } from '../auth'
import type { DbLike } from '../db'

/*
 * Small inline fixture for course/lecture service tests (PGlite). Test-only; not imported by
 * app code.
 *   Library course LIB: L1 (seq 1), L2 (seq 2), both ready library lectures.
 *     C1 ∈ L1, C2 ∈ L1+L2, C3 ∈ L2; edge C3 depends_on C1.
 *   Personal course P (owner A): PL1, PL2 (ready imports). PC1 ∈ PL1, PC2 ∈ PL1+PL2.
 */

const uid = (n: number): string => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`

export const ID = {
  A: uid(1),
  B: uid(2),
  S: uid(3),
  G: uid(4),
  LIB: uid(10),
  L1: uid(11),
  L2: uid(12),
  C1: uid(21),
  C2: uid(22),
  C3: uid(23),
  E1: uid(31),
  P: uid(40),
  PL1: uid(41),
  PL2: uid(42),
  PC1: uid(51),
  PC2: uid(52),
  ITEM: uid(60),
  ITEM2: uid(61),
  SESSION: uid(70),
} as const

/*
 * A and B are owner accounts: full limits like Google, and they can read the library (F0.7), so
 * the library-based tests keep working. G is a Google account: own courses only.
 */
export const ACTOR_A: Actor = { userId: ID.A, kind: 'owner', isSample: false }
export const ACTOR_B: Actor = { userId: ID.B, kind: 'owner', isSample: false }
export const ACTOR_G: Actor = { userId: ID.G, kind: 'google', isSample: false }
export const ACTOR_S: Actor = { userId: ID.S, kind: 'sample', isSample: true }

/** The 🔒 key_points value seeded on every concept; it must never reach a response. */
export const SECRET_KEY_POINT = 'SECRET-KEY-POINT'

export interface Fixture {
  testDb: TestDb
  db: DbLike
  exec: (sql: string) => Promise<unknown>
}

export async function createFixture(): Promise<Fixture> {
  const testDb = await createTestDb()
  const exec = (sql: string) => testDb.$client.exec(sql)
  const kp = `'["${SECRET_KEY_POINT}"]'::jsonb`
  await exec(`
    INSERT INTO profiles (id, kind) VALUES
      ('${ID.A}', 'owner'), ('${ID.B}', 'owner'), ('${ID.S}', 'sample'), ('${ID.G}', 'google');
    INSERT INTO courses (id, kind, title, attribution, layout) VALUES ('${ID.LIB}', 'library',
      'CS50x 2026',
      '{"source":"CS50x 2026 by Harvard University","license":"CC BY-NC-SA 4.0",
        "url":"https://cs50.harvard.edu/x/license/","adaptedBy":"Lectheo"}'::jsonb,
      '{"${ID.C1}":{"x":10,"y":20}}'::jsonb);
    INSERT INTO courses (id, kind, owner_id, title)
      VALUES ('${ID.P}', 'personal', '${ID.A}', 'Bio');
    INSERT INTO lectures (id, course_id, title, seq, source, status, audio_path) VALUES
      ('${ID.L1}', '${ID.LIB}', 'Lecture 1 · C', 1, 'library', 'ready', NULL),
      ('${ID.L2}', '${ID.LIB}', 'Lecture 2 · Arrays', 2, 'library', 'ready', NULL),
      ('${ID.PL1}', '${ID.P}', 'Week 1', 1, 'import', 'ready', '${ID.A}/${ID.PL1}'),
      ('${ID.PL2}', '${ID.P}', 'Week 2', 2, 'import', 'ready', NULL);
    INSERT INTO concepts (id, course_id, name, canonical_key, summary, key_points, first_lecture_id)
    VALUES
      ('${ID.C1}', '${ID.LIB}', 'Types', 'types', 'Data types', ${kp}, '${ID.L1}'),
      ('${ID.C2}', '${ID.LIB}', 'Loops', 'loops', 'Repetition', ${kp}, '${ID.L1}'),
      ('${ID.C3}', '${ID.LIB}', 'Arrays', 'arrays', 'Contiguous', ${kp}, '${ID.L2}'),
      ('${ID.PC1}', '${ID.P}', 'Cells', 'cells', 'Units', ${kp}, '${ID.PL1}'),
      ('${ID.PC2}', '${ID.P}', 'DNA', 'dna', 'Genes', ${kp}, '${ID.PL1}');
    INSERT INTO concept_occurrences (concept_id, lecture_id, segment_idxs, salience) VALUES
      ('${ID.C1}', '${ID.L1}', '{0}', 1), ('${ID.C2}', '${ID.L1}', '{1}', 1),
      ('${ID.C2}', '${ID.L2}', '{0}', 1), ('${ID.C3}', '${ID.L2}', '{1}', 1),
      ('${ID.PC1}', '${ID.PL1}', '{0}', 1), ('${ID.PC2}', '${ID.PL1}', '{1}', 1),
      ('${ID.PC2}', '${ID.PL2}', '{0}', 1);
    INSERT INTO concept_edges
      (id, course_id, from_concept_id, to_concept_id, relation, segment_idxs) VALUES
      ('${ID.E1}', '${ID.LIB}', '${ID.C3}', '${ID.C1}', 'depends_on', '{1}');
    INSERT INTO items (id, concept_id, lecture_id, kind, variant, status, public_payload,
      segment_idxs, prompt_version, model) VALUES
      ('${ID.ITEM}', '${ID.C1}', '${ID.L1}', 'diagnostic_mcq', 1, 'verified', '{}', '{0}',
        'v1', 'm'),
      ('${ID.ITEM2}', '${ID.C1}', '${ID.L1}', 'diagnostic_mcq', 2, 'verified', '{}', '{0}',
        'v1', 'm');
  `)
  return { testDb, db: testDb as unknown as DbLike, exec }
}

let markerSeq = 1000

/** Inserts a marker (optionally linked to a concept); returns its id. */
export async function addMarker(
  f: Fixture,
  m: { lectureId: string; userId: string; kind?: string; tMs?: number; conceptId?: string },
): Promise<string> {
  const id = uid(markerSeq++)
  await f.exec(`
    INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture) VALUES
      ('${id}', '${m.lectureId}', '${m.userId}', '${m.kind ?? 'lost'}', ${m.tMs ?? 1000}, 'watch');
    ${m.conceptId ? `INSERT INTO marker_concepts VALUES ('${id}', '${m.conceptId}', 0.9);` : ''}
  `)
  return id
}

export interface AttemptSpec {
  userId: string
  conceptId: string
  activityType: string
  outcome: 'correct' | 'partial' | 'incorrect' | 'invalid'
  confidence?: string
  assisted?: boolean
  minutesAgo?: number
  sessionId?: string
  itemId?: string
}

/** Inserts a graded attempt `minutesAgo` minutes in the past (default 60). */
export async function addAttempt(f: Fixture, a: AttemptSpec): Promise<void> {
  const conf = a.confidence ? `'${a.confidence}'` : 'NULL'
  const ref = (v?: string) => (v ? `'${v}'` : 'NULL')
  const score = a.outcome === 'correct' ? 1 : 0
  await f.exec(`
    INSERT INTO attempts (id, user_id, concept_id, activity_type, diagnostic_session_id, item_id,
      confidence, response, grading, score, max_score, outcome, assisted, created_at)
    VALUES (gen_random_uuid(), '${a.userId}', '${a.conceptId}', '${a.activityType}',
      ${ref(a.sessionId)}, ${ref(a.itemId)}, ${conf}, '{}', '{}', ${score}, 1, '${a.outcome}',
      ${a.assisted ?? false}, now() - interval '${a.minutesAgo ?? 60} minutes');
  `)
}

/** A diagnostic session for (user, lecture). */
export async function addSession(
  f: Fixture,
  s: { id: string; userId: string; lectureId: string; completed: boolean },
): Promise<void> {
  await f.exec(`
    INSERT INTO diagnostic_sessions
      (id, user_id, lecture_id, planned_item_ids, status, completed_at) VALUES
      ('${s.id}', '${s.userId}', '${s.lectureId}', '{}',
      '${s.completed ? 'completed' : 'active'}', ${s.completed ? 'now()' : 'NULL'});
  `)
}
