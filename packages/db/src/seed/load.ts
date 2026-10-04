import { computeLayout, layoutHash } from '@lectheo/domain/layout'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as s from '../schema'
import { buildLibraryRows } from './library'
import { DEFAULT_SEED_BASE_DATE, buildStudentRows } from './student'

/**
 * Works with both the postgres-js Db and the PGlite TestDb.
 * ponytail: `any` schema generics because the two drivers' full-schema types differ.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SeedDb = PgDatabase<PgQueryResultHKT, any, any>

export interface SeedCounts {
  [table: string]: number
}

/**
 * Inserts the CS50x library fixture (course, lectures, segments, concepts, occurrences, edges,
 * items, item secrets) in one transaction. Idempotent: every insert is ON CONFLICT DO NOTHING
 * and every id is stable, so re-running changes nothing. Returns the fixture row counts.
 * The course's concept-map layout is computed here and upserted (refreshed on re-seed): library
 * content is never written at runtime (Data Model §6 invariant 7).
 */
export async function seedLibrary(db: SeedDb): Promise<SeedCounts> {
  const rows = buildLibraryRows()
  const graph = {
    concepts: rows.concepts.map((c) => ({ id: c.id! })),
    edges: rows.edges.map((e) => ({
      id: e.id!,
      from: e.fromConceptId,
      to: e.toConceptId,
      relation: e.relation,
    })),
  }
  const layout = await computeLayout(graph.concepts, graph.edges)
  const hash = layoutHash(graph.concepts, graph.edges)
  await db.transaction(async (tx) => {
    await tx
      .insert(s.courses)
      .values({ ...rows.course, layout, layoutHash: hash })
      .onConflictDoUpdate({ target: s.courses.id, set: { layout, layoutHash: hash } })
    await tx.insert(s.lectures).values(rows.lectures).onConflictDoNothing()
    await tx.insert(s.transcriptSegments).values(rows.segments).onConflictDoNothing()
    await tx.insert(s.concepts).values(rows.concepts).onConflictDoNothing()
    await tx.insert(s.conceptOccurrences).values(rows.occurrences).onConflictDoNothing()
    await tx.insert(s.conceptEdges).values(rows.edges).onConflictDoNothing()
    await tx.insert(s.items).values(rows.items).onConflictDoNothing()
    await tx.insert(s.itemSecrets).values(rows.itemSecrets).onConflictDoNothing()
  })
  return {
    courses: 1,
    lectures: rows.lectures.length,
    transcript_segments: rows.segments.length,
    concepts: rows.concepts.length,
    concept_occurrences: rows.occurrences.length,
    concept_edges: rows.edges.length,
    items: rows.items.length,
    item_secrets: rows.itemSecrets.length,
  }
}

export interface SeedStudentOptions {
  /** Reference "now" for the student's history (default: DEFAULT_SEED_BASE_DATE). */
  baseDate?: Date
}

/**
 * Inserts the seed student (profiles.kind = 'seed') and its per-user rows, which clone_sample()
 * copies for every sample account. Requires seedLibrary() first. Idempotent like seedLibrary.
 */
export async function seedStudent(
  db: SeedDb,
  options: SeedStudentOptions = {},
): Promise<SeedCounts> {
  const rows = buildStudentRows(options.baseDate ?? DEFAULT_SEED_BASE_DATE)
  await db.transaction(async (tx) => {
    await tx.insert(s.profiles).values(rows.profile).onConflictDoNothing()
    await tx.insert(s.markers).values(rows.markers).onConflictDoNothing()
    await tx.insert(s.markerConcepts).values(rows.markerConcepts).onConflictDoNothing()
    await tx.insert(s.diagnosticSessions).values(rows.sessions).onConflictDoNothing()
    await tx.insert(s.diagnosticResponses).values(rows.responses).onConflictDoNothing()
    await tx.insert(s.activities).values(rows.activities).onConflictDoNothing()
    await tx.insert(s.messages).values(rows.messages).onConflictDoNothing()
    await tx.insert(s.attempts).values(rows.attempts).onConflictDoNothing()
  })
  return {
    profiles: 1,
    markers: rows.markers.length,
    marker_concepts: rows.markerConcepts.length,
    diagnostic_sessions: rows.sessions.length,
    diagnostic_responses: rows.responses.length,
    activities: rows.activities.length,
    messages: rows.messages.length,
    attempts: rows.attempts.length,
  }
}

/** Library first, then the seed student (FKs). */
export async function seedAll(db: SeedDb, options: SeedStudentOptions = {}): Promise<SeedCounts> {
  return { ...(await seedLibrary(db)), ...(await seedStudent(db, options)) }
}
