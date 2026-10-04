import { computeLayout, layoutHash } from '@lectheo/domain/layout'
import { and, eq, getTableColumns, gte, inArray, notInArray, sql } from 'drizzle-orm'
import type {
  PgColumn,
  PgDatabase,
  PgQueryResultHKT,
  PgTable,
  PgUpdateSetSource,
} from 'drizzle-orm/pg-core'
import * as s from '../schema'
import { LIBRARY_COURSE_ID } from './ids'
import { buildLibraryRows, type LibraryRows } from './library'
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

/** INSERT … ON CONFLICT (target) DO UPDATE SET every non-key column = excluded.column. */
async function upsert<T extends PgTable>(
  tx: SeedDb,
  table: T,
  values: T['$inferInsert'][],
  target: PgColumn[],
): Promise<void> {
  if (values.length === 0) return
  const keys = new Set(target.map((c) => c.name))
  // ponytail: the generic PgUpdateSetSource<T> can't be built from a mapped object, hence the cast.
  const set = Object.fromEntries(
    Object.entries(getTableColumns(table))
      .filter(([, col]) => !keys.has(col.name))
      .map(([prop, col]) => [prop, sql.raw(`excluded."${col.name}"`)]),
  ) as PgUpdateSetSource<T>
  await tx.insert(table).values(values).onConflictDoUpdate({ target, set })
}

/** Item ids someone has used: attempts, activities, diagnostic answers and planned sessions. */
async function referencedItems(tx: SeedDb, itemIds: readonly string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set()
  const ids = sql.join(
    itemIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const result = await tx.execute<{ id: string }>(sql`
    select i.id from items i where i.id in (${ids}) and (
      exists (select 1 from attempts a where a.item_id = i.id)
      or exists (select 1 from activities a where a.item_id = i.id)
      or exists (select 1 from diagnostic_responses r where r.item_id = i.id)
      or exists (select 1 from diagnostic_sessions d where i.id = any(d.planned_item_ids)))`)
  // ponytail: postgres-js returns the row array, PGlite a { rows } result.
  const list = Array.isArray(result) ? result : (result as { rows: { id: string }[] }).rows
  return new Set(list.map((r) => r.id))
}

/**
 * Removes library rows the fixture no longer has, so a regenerated bank never leaves stale
 * concepts, edges or questions behind. Items someone has used are retired instead (attempts and
 * sessions keep pointing at them, and retired items are never served); concepts with history or
 * retired items are kept (deleting a concept cascades to its attempts, Data Model invariant 6).
 */
async function pruneLibrary(tx: SeedDb, rows: LibraryRows): Promise<void> {
  const lectureIds = rows.lectures.map((l) => l.id!)
  await tx.delete(s.conceptEdges).where(
    and(
      eq(s.conceptEdges.courseId, LIBRARY_COURSE_ID),
      notInArray(
        s.conceptEdges.id,
        rows.edges.map((e) => e.id!),
      ),
    ),
  )
  const keepOccurrence = new Set(rows.occurrences.map((o) => `${o.conceptId}:${o.lectureId}`))
  const occurrences = await tx
    .select({
      conceptId: s.conceptOccurrences.conceptId,
      lectureId: s.conceptOccurrences.lectureId,
    })
    .from(s.conceptOccurrences)
    .where(inArray(s.conceptOccurrences.lectureId, lectureIds))
  for (const o of occurrences.filter((o) => !keepOccurrence.has(`${o.conceptId}:${o.lectureId}`))) {
    await tx
      .delete(s.conceptOccurrences)
      .where(
        and(
          eq(s.conceptOccurrences.conceptId, o.conceptId),
          eq(s.conceptOccurrences.lectureId, o.lectureId),
        ),
      )
  }
  const stale = await tx
    .select({ id: s.items.id })
    .from(s.items)
    .where(
      and(
        inArray(s.items.lectureId, lectureIds),
        notInArray(
          s.items.id,
          rows.items.map((i) => i.id!),
        ),
      ),
    )
  const used = await referencedItems(
    tx,
    stale.map((i) => i.id),
  )
  const retire = stale.filter((i) => used.has(i.id)).map((i) => i.id)
  const drop = stale.filter((i) => !used.has(i.id)).map((i) => i.id)
  if (retire.length > 0) {
    await tx.update(s.items).set({ status: 'retired' }).where(inArray(s.items.id, retire))
  }
  if (drop.length > 0) await tx.delete(s.items).where(inArray(s.items.id, drop))
  await tx.delete(s.concepts).where(
    and(
      eq(s.concepts.courseId, LIBRARY_COURSE_ID),
      notInArray(
        s.concepts.id,
        rows.concepts.map((c) => c.id!),
      ),
      sql`not exists (select 1 from attempts a where a.concept_id = "concepts"."id")`,
      sql`not exists (select 1 from activities a where a.concept_id = "concepts"."id")`,
      sql`not exists (select 1 from items i where i.concept_id = "concepts"."id")`,
      sql`not exists (select 1 from marker_concepts mc where mc.concept_id = "concepts"."id")`,
    ),
  )
  // Segments are keyed (lecture, idx): drop the tail when a regenerated transcript got shorter.
  for (const lecture of lectureIds) {
    const count = rows.segments.filter((seg) => seg.lectureId === lecture).length
    await tx
      .delete(s.transcriptSegments)
      .where(and(eq(s.transcriptSegments.lectureId, lecture), gte(s.transcriptSegments.idx, count)))
  }
}

/**
 * Inserts or refreshes the CS50x library fixture (course, lectures, segments, concepts,
 * occurrences, edges, items, item secrets) in one transaction. Idempotent: ids are stable and
 * every row is upserted from the fixture and rows the fixture dropped are pruned (pruneLibrary), so
 * re-running converges the DB to the fixture. `rows` is a test seam (seeding an older bank).
 * Library content is never written at runtime (Data Model §6 invariant 7), only here.
 */
export async function seedLibrary(
  db: SeedDb,
  rows: LibraryRows = buildLibraryRows(),
): Promise<SeedCounts> {
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
    // Library rows are owned by the fixture: re-seeding overwrites them so fixture fixes (e.g. the
    // L5 re-time) reach already-seeded databases. Ids are stable, so attempts/markers stay linked.
    await upsert(tx, s.lectures, rows.lectures, [s.lectures.id])
    await upsert(tx, s.transcriptSegments, rows.segments, [
      s.transcriptSegments.lectureId,
      s.transcriptSegments.idx,
    ])
    await upsert(tx, s.concepts, rows.concepts, [s.concepts.id])
    await upsert(tx, s.conceptOccurrences, rows.occurrences, [
      s.conceptOccurrences.conceptId,
      s.conceptOccurrences.lectureId,
    ])
    await upsert(tx, s.conceptEdges, rows.edges, [s.conceptEdges.id])
    await upsert(tx, s.items, rows.items, [s.items.id])
    await upsert(tx, s.itemSecrets, rows.itemSecrets, [s.itemSecrets.itemId])
    await pruneLibrary(tx, rows)
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
 * The seed profile's history is replaced, not merged: a regenerated bank changes item text, so
 * stale answers, messages and rubric snapshots must not survive next to it (clone_sample copies
 * them into every new sample account). Only the kind = 'seed' profile's rows are touched.
 */
export async function seedStudent(
  db: SeedDb,
  options: SeedStudentOptions = {},
): Promise<SeedCounts> {
  const rows = buildStudentRows(options.baseDate ?? DEFAULT_SEED_BASE_DATE)
  await db.transaction(async (tx) => {
    await tx.insert(s.profiles).values(rows.profile).onConflictDoNothing()
    const seed = rows.profile.id!
    // Children go by cascade: messages (activities), diagnostic_responses (sessions),
    // marker_concepts (markers).
    await tx.delete(s.attempts).where(eq(s.attempts.userId, seed))
    await tx.delete(s.activities).where(eq(s.activities.userId, seed))
    await tx.delete(s.diagnosticSessions).where(eq(s.diagnosticSessions.userId, seed))
    await tx.delete(s.markers).where(eq(s.markers.userId, seed))
    await tx.insert(s.markers).values(rows.markers)
    await tx.insert(s.markerConcepts).values(rows.markerConcepts)
    await tx.insert(s.diagnosticSessions).values(rows.sessions)
    await tx.insert(s.diagnosticResponses).values(rows.responses)
    await tx.insert(s.activities).values(rows.activities)
    await tx.insert(s.messages).values(rows.messages)
    await tx.insert(s.attempts).values(rows.attempts)
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
