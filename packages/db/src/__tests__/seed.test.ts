import {
  AnswerKeyByKind,
  AttemptGrading,
  Chapters,
  CourseAttributionJson,
  DistractorMeta,
  HintsSecret,
  ItemVerification,
  KeyPoints,
  LectureMediaJson,
  MessageGuard,
  PublicPayloadByKind,
  RubricSecret,
  RubricSnapshot,
  type ItemKind,
} from '@lectheo/contracts'
import { beforeAll, describe, expect, it } from 'vitest'
import { BANK_SHORTFALL } from '../seed/fixtures/bank-report'
import { LECTURES, buildLibraryRows } from '../seed/library'
import {
  LIBRARY_COURSE_ID,
  SEED_STUDENT_ID,
  conceptId,
  edgeId,
  itemId,
  lectureId,
  seedId,
} from '../seed/ids'
import { seedAll, seedLibrary } from '../seed/load'
import { buildStudentRows } from '../seed/student'
import { createTestDb, type TestDb } from '../testing'

const PER_USER_TABLES = [
  'markers',
  'marker_concepts',
  'diagnostic_sessions',
  'diagnostic_responses',
  'activities',
  'messages',
  'attempts',
] as const
const ALL_TABLES = [
  'profiles',
  'courses',
  'lectures',
  'transcript_segments',
  'concepts',
  'concept_occurrences',
  'concept_edges',
  'items',
  'item_secrets',
  ...PER_USER_TABLES,
] as const

async function rows<T>(db: TestDb, query: string, params: unknown[] = []): Promise<T[]> {
  return (await db.$client.query<T>(query, params)).rows
}

async function tableCounts(db: TestDb): Promise<Record<string, number>> {
  const entries = await Promise.all(
    ALL_TABLES.map(async (t) => {
      const [row] = await rows<{ n: number }>(db, `SELECT count(*)::int AS n FROM ${t}`)
      return [t, row?.n ?? 0] as const
    }),
  )
  return Object.fromEntries(entries)
}

interface ItemRow {
  id: string
  concept_id: string
  lecture_id: string
  kind: ItemKind
  status: string
  public_payload: unknown
  segment_idxs: number[]
  verification: unknown
  answer_key: unknown
  distractor_meta: unknown
  rubric: unknown
  hints: unknown
}

describe('CS50x library + seed student fixture', () => {
  let db: TestDb
  let firstCounts: Record<string, number>
  let items: ItemRow[]
  /** "lectureId:idx" of every stored segment. */
  let segmentKeys: Set<string>

  beforeAll(async () => {
    db = await createTestDb()
    await seedAll(db)
    firstCounts = await tableCounts(db)
    items = await rows<ItemRow>(
      db,
      `SELECT i.*, s.answer_key, s.distractor_meta, s.rubric, s.hints
       FROM items i JOIN item_secrets s ON s.item_id = i.id`,
    )
    const segs = await rows<{ lecture_id: string; idx: number }>(
      db,
      'SELECT lecture_id, idx FROM transcript_segments',
    )
    segmentKeys = new Set(segs.map((s) => `${s.lecture_id}:${s.idx}`))
  }, 60_000)

  it('builds the expected fixture sizes', () => {
    // 6 concepts per lecture × (2 MCQ + 2 flaw + 1 transfer), F7.3, minus the labeled shortfall.
    const bank = 18 * 5 - BANK_SHORTFALL.reduce((n, s) => n + s.missing, 0)
    expect(firstCounts).toMatchObject({ courses: 1, lectures: 3, concepts: 18, item_secrets: bank })
    expect(firstCounts.items).toBe(bank)
    expect(firstCounts.transcript_segments).toBe(
      LECTURES.reduce((n, l) => n + l.segments.length, 0),
    )
    expect(firstCounts.concept_edges).toBeGreaterThanOrEqual(20)
  })

  it('introduces 6 concepts in Lecture 5, so its diagnostic plans 4 questions', async () => {
    const [l5] = await rows<{ n: number }>(
      db,
      'SELECT count(*)::int AS n FROM concepts WHERE first_lecture_id = $1',
      [lectureId('l5')],
    )
    expect(l5?.n).toBe(6)
  })

  it('stores the library concept-map layout (never computed at runtime)', async () => {
    const [course] = await rows<{ layout: Record<string, unknown>; layout_hash: string }>(
      db,
      'SELECT layout, layout_hash FROM courses',
    )
    const concepts = await rows<{ id: string }>(db, 'SELECT id FROM concepts')
    expect(Object.keys(course!.layout).sort()).toEqual(concepts.map((c) => c.id).sort())
    expect(course!.layout_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is idempotent: seeding twice changes nothing', async () => {
    await seedAll(db)
    expect(await tableCounts(db)).toEqual(firstCounts)
  })

  it('re-seeding replaces stale seed-student history with the current script', async () => {
    const student = buildStudentRows()
    // An older script: different answers, message text and an extra row the new one lacks.
    await db.$client.query(
      `UPDATE diagnostic_responses SET option_id = 'z' WHERE session_id IN
         (SELECT id FROM diagnostic_sessions WHERE user_id = $1)`,
      [SEED_STUDENT_ID],
    )
    await db.$client.query(
      `UPDATE messages SET content = 'stale' WHERE activity_id IN
         (SELECT id FROM activities WHERE user_id = $1)`,
      [SEED_STUDENT_ID],
    )
    await db.$client.query(
      `INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture)
       VALUES ($1, $2, $3, 'lost', 1, 'watch')`,
      [seedId('test:stale-marker'), lectureId('l3'), SEED_STUDENT_ID],
    )

    await seedAll(db)

    const options = await rows<{ option_id: string }>(
      db,
      `SELECT r.option_id FROM diagnostic_responses r JOIN diagnostic_sessions d
         ON d.id = r.session_id WHERE d.user_id = $1`,
      [SEED_STUDENT_ID],
    )
    expect(options.map((o) => o.option_id).sort()).toEqual(
      student.responses.map((r) => r.optionId).sort(),
    )
    const [stale] = await rows<{ n: number }>(
      db,
      `SELECT count(*)::int AS n FROM messages WHERE content = 'stale'`,
    )
    expect(stale?.n).toBe(0)
    expect(await tableCounts(db)).toEqual(firstCounts)
  })

  it('re-seeding restores stale library rows from the fixture (e.g. a re-timed lecture)', async () => {
    const l5 = lectureId('l5')
    const segment = `SELECT start_ms FROM transcript_segments WHERE lecture_id = '${l5}' AND idx = 0`
    const [before] = await rows<{ start_ms: number }>(db, segment)
    await db.$client.query(
      `UPDATE transcript_segments SET start_ms = start_ms + 999 WHERE lecture_id = '${l5}'`,
    )
    await db.$client.query(`UPDATE lectures SET media = NULL WHERE id = '${l5}'`)

    await seedAll(db)

    const [after] = await rows<{ start_ms: number }>(db, segment)
    const [lecture] = await rows<{ media: unknown }>(
      db,
      `SELECT media FROM lectures WHERE id = '${l5}'`,
    )
    expect(after!.start_ms).toBe(before!.start_ms)
    expect(lecture!.media).not.toBeNull()
    expect(await tableCounts(db)).toEqual(firstCounts)
  })

  it('uses stable, deterministic ids', () => {
    expect(seedId('x')).toBe(seedId('x'))
    expect(seedId('x')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(buildLibraryRows()).toEqual(buildLibraryRows())
    expect(buildStudentRows(new Date('2026-01-01T00:00:00Z'))).toEqual(
      buildStudentRows(new Date('2026-01-01T00:00:00Z')),
    )
  })

  it('validates every jsonb column against its contracts schema', async () => {
    const [course] = await rows<{ attribution: unknown; owner_id: string | null; kind: string }>(
      db,
      'SELECT attribution, owner_id, kind FROM courses WHERE id = $1',
      [LIBRARY_COURSE_ID],
    )
    expect(course?.kind).toBe('library')
    expect(course?.owner_id).toBeNull()
    expect(CourseAttributionJson.parse(course?.attribution)).toEqual({
      source: 'CS50x 2026 by Harvard University',
      license: 'CC BY-NC-SA 4.0',
      url: 'https://cs50.harvard.edu/x/license/',
      adaptedBy: 'Lectheo',
    })
    for (const l of await rows<{ media: unknown }>(db, 'SELECT media FROM lectures')) {
      const media = LectureMediaJson.parse(l.media)
      expect(media.youtubeId).toMatch(/^[\w-]{11}$/)
      const coreMs = (media.endMs ?? 0) - (media.startMs ?? 0)
      expect(coreMs).toBeGreaterThanOrEqual(30 * 60_000)
      expect(coreMs).toBeLessThanOrEqual(45 * 60_000)
    }
    for (const c of await rows<{ key_points: unknown }>(db, 'SELECT key_points FROM concepts')) {
      KeyPoints.parse(c.key_points)
    }
    // F11.6: every library lecture has chapters, linked to library concepts only.
    const conceptIds = new Set(
      (await rows<{ id: string }>(db, 'SELECT id FROM concepts')).map((c) => c.id),
    )
    for (const l of await rows<{ chapters: unknown }>(db, 'SELECT chapters FROM lectures')) {
      const chapters = Chapters.parse(l.chapters)
      expect(chapters.length).toBeGreaterThanOrEqual(5)
      for (const c of chapters) expect(c.conceptIds.every((id) => conceptIds.has(id))).toBe(true)
    }
    for (const item of items) {
      PublicPayloadByKind[item.kind].parse(item.public_payload)
      AnswerKeyByKind[item.kind].parse(item.answer_key)
      expect(ItemVerification.parse(item.verification).verdict).toBe('pass')
      if (item.kind === 'diagnostic_mcq') DistractorMeta.parse(item.distractor_meta)
      else {
        RubricSecret.parse(item.rubric)
        HintsSecret.parse(item.hints)
      }
    }
    for (const a of await rows<{ rubric_snapshot: unknown }>(
      db,
      'SELECT rubric_snapshot FROM activities',
    )) {
      RubricSnapshot.parse(a.rubric_snapshot)
    }
    for (const a of await rows<{ grading: unknown }>(db, 'SELECT grading FROM attempts')) {
      AttemptGrading.parse(a.grading)
    }
    for (const m of await rows<{ guard: unknown }>(
      db,
      'SELECT guard FROM messages WHERE guard IS NOT NULL',
    )) {
      MessageGuard.parse(m.guard)
    }
  })

  it('grounds every concept, occurrence, edge and item in existing segments (invariant 2)', async () => {
    const cited = (lecture: string | null, idxs: number[]) =>
      idxs.length > 0 && idxs.every((i) => segmentKeys.has(`${lecture}:${i}`))
    const concepts = await rows<{ first_lecture_id: string; key_points: KeyPoints }>(
      db,
      'SELECT first_lecture_id, key_points FROM concepts',
    )
    for (const c of concepts) {
      for (const kp of c.key_points) expect(cited(c.first_lecture_id, kp.segmentIdxs)).toBe(true)
    }
    const occurrences = await rows<{ lecture_id: string; segment_idxs: number[] }>(
      db,
      'SELECT lecture_id, segment_idxs FROM concept_occurrences',
    )
    for (const o of occurrences) expect(cited(o.lecture_id, o.segment_idxs)).toBe(true)
    const edges = await rows<{ lecture_id: string; segment_idxs: number[] }>(
      db,
      'SELECT lecture_id, segment_idxs FROM concept_edges',
    )
    for (const e of edges) expect(cited(e.lecture_id, e.segment_idxs)).toBe(true)
    for (const item of items) expect(cited(item.lecture_id, item.segment_idxs)).toBe(true)
    // Every concept occurs in its first lecture.
    const [orphans] = await rows<{ n: number }>(
      db,
      `SELECT count(*)::int AS n FROM concepts c WHERE NOT EXISTS (
         SELECT 1 FROM concept_occurrences o
         WHERE o.concept_id = c.id AND o.lecture_id = c.first_lecture_id)`,
    )
    expect(orphans?.n).toBe(0)
  })

  it('keeps depends_on edges acyclic and includes the cross-lecture prerequisite chain', async () => {
    const edges = await rows<{ from_concept_id: string; to_concept_id: string }>(
      db,
      `SELECT from_concept_id, to_concept_id FROM concept_edges WHERE relation = 'depends_on'`,
    )
    const next = new Map<string, string[]>()
    for (const e of edges)
      next.set(e.from_concept_id, [...(next.get(e.from_concept_id) ?? []), e.to_concept_id])
    const state = new Map<string, 'visiting' | 'done'>()
    const hasCycle = (node: string): boolean => {
      if (state.get(node) === 'visiting') return true
      if (state.get(node) === 'done') return false
      state.set(node, 'visiting')
      const cyclic = (next.get(node) ?? []).some(hasCycle)
      state.set(node, 'done')
      return cyclic
    }
    expect([...next.keys()].some(hasCycle)).toBe(false)
    const has = (from: string, to: string) =>
      edges.some((e) => e.from_concept_id === conceptId(from) && e.to_concept_id === conceptId(to))
    expect(has('pointers', 'arrays')).toBe(true)
    expect(has('linked_lists', 'pointers')).toBe(true)
    expect(has('hash_tables', 'linked_lists')).toBe(true)
    expect(has('binary_search', 'arrays')).toBe(true)
    expect(has('merge_sort', 'recursion')).toBe(true)
  })

  it('has the F7.3 set for every concept: 2 MCQs, 2 flaw scenarios, 1 transfer, all verified', async () => {
    const concepts = await rows<{ id: string; canonical_key: string; key_points: KeyPoints }>(
      db,
      'SELECT id, canonical_key, key_points FROM concepts',
    )
    // Architecture §5.3: a slot still failing after the one redraft round stays empty, labeled.
    expect(BANK_SHORTFALL.filter((s) => s.kind !== 'transfer')).toEqual([])
    const want = (key: string, kind: ItemKind, n: number) =>
      n - (BANK_SHORTFALL.find((s) => s.concept === key && s.kind === kind)?.missing ?? 0)
    for (const c of concepts) {
      const mine = items.filter((i) => i.concept_id === c.id)
      const count = (kind: ItemKind) => mine.filter((i) => i.kind === kind).length
      expect(mine.every((i) => i.status === 'verified')).toBe(true)
      expect(count('diagnostic_mcq')).toBe(2)
      expect(count('spot_flaw')).toBe(2)
      expect(count('transfer')).toBe(want(c.canonical_key, 'transfer', 1))
      // The teach-back rubric is the concept's key points.
      expect(c.key_points.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('gives every item its secret row (answers and rubrics never in the public payload)', async () => {
    const [orphans] = await rows<{ n: number }>(
      db,
      `SELECT count(*)::int AS n FROM items i
       WHERE NOT EXISTS (SELECT 1 FROM item_secrets s WHERE s.item_id = i.id)`,
    )
    expect(orphans?.n).toBe(0)
    for (const item of items) {
      const publicText = JSON.stringify(item.public_payload)
      expect(publicText).not.toMatch(/correctOptionId|hasFlaw|modelSolution|criteria/)
    }
  })

  it('keeps about 30% of flaw scenarios fully correct, with in-bounds flaw locations', () => {
    const flaws = items.filter((i) => i.kind === 'spot_flaw')
    let correct = 0
    for (const item of flaws) {
      const { sentences } = PublicPayloadByKind.spot_flaw.parse(item.public_payload)
      const key = AnswerKeyByKind.spot_flaw.parse(item.answer_key)
      if (key.hasFlaw) {
        expect(key.flawSentenceIdx).not.toBeNull()
        expect(key.flawSentenceIdx).toBeLessThan(sentences.length)
        expect(key.flawSummary).toBeTruthy()
        expect(key.correction).toBeTruthy()
      } else {
        correct += 1
        expect(key).toMatchObject({ flawSentenceIdx: null, flawSummary: null, correction: null })
      }
    }
    const ratio = correct / flaws.length
    expect(ratio).toBeGreaterThanOrEqual(0.2)
    expect(ratio).toBeLessThanOrEqual(0.4)
  })

  it('has valid MCQs: unique options, a real correct option, a misconception per distractor', () => {
    for (const item of items.filter((i) => i.kind === 'diagnostic_mcq')) {
      const { options } = PublicPayloadByKind.diagnostic_mcq.parse(item.public_payload)
      const key = AnswerKeyByKind.diagnostic_mcq.parse(item.answer_key)
      const ids = options.map((o) => o.id)
      expect(options).toHaveLength(4)
      expect(new Set(ids).size).toBe(ids.length)
      expect(new Set(options.map((o) => o.text)).size).toBe(options.length)
      expect(ids).toContain(key.correctOptionId)
      const meta = DistractorMeta.parse(item.distractor_meta)
      expect(Object.keys(meta).sort()).toEqual(
        ids.filter((id) => id !== key.correctOptionId).sort(),
      )
    }
  })

  it('includes the classic "hash table lookup is always O(1)" misconception in Lecture 5', () => {
    const l5 = items.filter((i) => i.lecture_id === lectureId('l5'))
    const mcq = l5.some(
      (i) =>
        i.kind === 'diagnostic_mcq' &&
        Object.values(DistractorMeta.parse(i.distractor_meta)).some((d) =>
          /always O\(1\)/i.test(d.misconception),
        ),
    )
    const flaw = l5.some(
      (i) =>
        i.kind === 'spot_flaw' &&
        PublicPayloadByKind.spot_flaw
          .parse(i.public_payload)
          .sentences.some((s) => /always takes O\(1\)/i.test(s)) &&
        AnswerKeyByKind.spot_flaw.parse(i.answer_key).hasFlaw,
    )
    expect(mcq).toBe(true)
    expect(flaw).toBe(true)
  })

  describe('seed student', () => {
    it('is a seed profile', async () => {
      const [p] = await rows<{ kind: string; display_name: string }>(
        db,
        'SELECT kind, display_name FROM profiles WHERE id = $1',
        [SEED_STUDENT_ID],
      )
      expect(p).toEqual({ kind: 'seed', display_name: 'Sample student' })
    })

    it('leaves Lecture 5 untouched ("Ready to watch")', async () => {
      const l5 = lectureId('l5')
      const counts = await rows<{ n: number }>(
        db,
        `SELECT (SELECT count(*) FROM markers WHERE lecture_id = $1)
              + (SELECT count(*) FROM diagnostic_sessions WHERE lecture_id = $1)
              + (SELECT count(*) FROM attempts a JOIN concepts c ON c.id = a.concept_id
                 WHERE c.first_lecture_id = $1)
              + (SELECT count(*) FROM activities a JOIN concepts c ON c.id = a.concept_id
                 WHERE c.first_lecture_id = $1) AS n`,
        [l5],
      )
      expect(Number(counts[0]?.n)).toBe(0)
    })

    it('has a completed Lecture 4 diagnostic with a confident mistake on pointers', async () => {
      const [session] = await rows<{ id: string; status: string; follow_ups_used: number }>(
        db,
        'SELECT id, status, follow_ups_used FROM diagnostic_sessions WHERE user_id = $1 AND lecture_id = $2',
        [SEED_STUDENT_ID, lectureId('l4')],
      )
      expect(session?.status).toBe('completed')
      expect(session?.follow_ups_used).toBe(1)
      const pointerAnswers = await rows<{
        is_follow_up: boolean
        confidence: string
        correct: boolean
      }>(
        db,
        `SELECT r.is_follow_up, r.confidence, r.correct FROM diagnostic_responses r
         JOIN items i ON i.id = r.item_id
         WHERE r.session_id = $1 AND i.concept_id = $2 ORDER BY r.answered_at`,
        [session?.id, conceptId('pointers')],
      )
      expect(pointerAnswers).toEqual([
        { is_follow_up: false, confidence: 'sure', correct: false },
        { is_follow_up: true, confidence: 'unsure', correct: false },
      ])
      const [attemptCount] = await rows<{ n: number }>(
        db,
        `SELECT count(*)::int AS n FROM attempts WHERE diagnostic_session_id = $1 AND outcome = 'incorrect'`,
        [session?.id],
      )
      expect(attemptCount?.n).toBe(2)
    })

    it('produces the intended mastery map (L3 mostly green, L4 red on pointers)', async () => {
      const attempts = await rows<{
        concept_id: string
        activity_type: string
        outcome: string
        confidence: string | null
        assisted: boolean
        is_follow_up: boolean | null
        created_at: Date
      }>(
        db,
        `SELECT a.concept_id, a.activity_type, a.outcome, a.confidence, a.assisted, a.created_at,
                r.is_follow_up
         FROM attempts a
         LEFT JOIN diagnostic_responses r
           ON r.session_id = a.diagnostic_session_id AND r.item_id = a.item_id
         WHERE a.user_id = $1 ORDER BY a.created_at`,
        [SEED_STUDENT_ID],
      )
      // Compact restatement of Architecture §6.2 (the real one lives in @lectheo/domain).
      const mastery = (concept: string): string => {
        const mine = attempts.filter((a) => a.concept_id === conceptId(concept))
        const last = mine.at(-1)
        if (!last) return 'gray'
        if (last.outcome === 'incorrect') return 'red'
        const independent = (a: (typeof mine)[number]) =>
          a.activity_type === 'diagnostic' ? a.confidence === 'sure' : !a.assisted
        const strong = new Set(
          mine.filter((a) => a.outcome === 'correct' && independent(a)).map((a) => a.activity_type),
        )
        if (strong.size >= 2 && [...strong].some((t) => t !== 'diagnostic')) return 'green'
        return mine.some((a) => a.outcome === 'correct' || a.outcome === 'partial')
          ? 'amber'
          : 'red'
      }
      expect({
        binary_search: mastery('binary_search'),
        selection_sort: mastery('selection_sort'),
        bubble_sort: mastery('bubble_sort'),
        recursion: mastery('recursion'),
        asymptotic_notation: mastery('asymptotic_notation'),
        merge_sort: mastery('merge_sort'),
        pointers: mastery('pointers'),
        pass_by_reference: mastery('pass_by_reference'),
        malloc_and_null: mastery('malloc_and_null'),
        memory_leaks: mastery('memory_leaks'),
        strings_as_char_pointers: mastery('strings_as_char_pointers'),
        hash_tables: mastery('hash_tables'),
      }).toEqual({
        binary_search: 'green',
        selection_sort: 'green',
        bubble_sort: 'green',
        recursion: 'green',
        asymptotic_notation: 'amber',
        merge_sort: 'amber',
        pointers: 'red',
        pass_by_reference: 'amber',
        malloc_and_null: 'amber',
        memory_leaks: 'amber',
        strings_as_char_pointers: 'gray',
        hash_tables: 'gray',
      })
    })

    it('stores L3 practice history with messages and rubric snapshots', async () => {
      const acts = await rows<{ type: string; n_messages: number; has_rubric: boolean }>(
        db,
        `SELECT a.type, (SELECT count(*)::int FROM messages m WHERE m.activity_id = a.id) AS n_messages,
                a.rubric_snapshot IS NOT NULL AS has_rubric
         FROM activities a WHERE a.user_id = $1`,
        [SEED_STUDENT_ID],
      )
      expect(acts.every((a) => a.has_rubric)).toBe(true)
      expect(
        acts.filter((a) => a.type === 'spot_flaw' && a.n_messages > 0).length,
      ).toBeGreaterThanOrEqual(3)
      expect(
        acts.filter((a) => a.type === 'teach_back' && a.n_messages > 0).length,
      ).toBeGreaterThanOrEqual(1)
    })

    it('can be cloned by clone_sample when the migration is present', async () => {
      const [fn] = await rows<{ n: number }>(
        db,
        `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'clone_sample'`,
      )
      if (!fn?.n) return
      const sampleId = '00000000-0000-4000-8000-00000000c10e'
      await db.$client.query(`INSERT INTO profiles (id, kind) VALUES ($1, 'sample')`, [sampleId])
      await db.$client.query('SELECT clone_sample($1, $2)', [SEED_STUDENT_ID, sampleId])
      for (const table of ['markers', 'diagnostic_sessions', 'activities', 'attempts']) {
        const [seed] = await rows<{ n: number }>(
          db,
          `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
          [SEED_STUDENT_ID],
        )
        const [copy] = await rows<{ n: number }>(
          db,
          `SELECT count(*)::int AS n FROM ${table} WHERE user_id = $1`,
          [sampleId],
        )
        expect(copy?.n).toBe(seed?.n)
      }
    })
  })
})

describe('re-seeding a regenerated bank', () => {
  it('prunes rows the new bank dropped, retiring used items and keeping their history', async () => {
    const db = await createTestDb()
    const fresh = buildLibraryRows()
    const at = <T>(list: readonly T[], pick: (x: T) => boolean): T => {
      const found = list.find(pick)
      if (!found) throw new Error('fixture row missing')
      return found
    }
    const hashTables = conceptId('hash_tables')
    const template = at(fresh.items, (i) => i.conceptId === hashTables)
    const secret = at(fresh.itemSecrets, (s) => s.itemId === template.id)
    const occurrence = at(fresh.occurrences, (o) => o.conceptId === hashTables)
    const conceptRow = at(fresh.concepts, (c) => c.id === hashTables)
    // An older bank: a concept someone practised, a concept nobody did, and an extra question.
    const kept = conceptId('stale_kept')
    const dropped = conceptId('stale_dropped')
    const usedItem = itemId('stale_kept', 'diagnostic_mcq', 1)
    const unusedItem = itemId('hash_tables', 'diagnostic_mcq', 3)
    const staleEdge = edgeId('stale_dropped', 'depends_on', 'hash_tables')
    const stale = (id: string, key: string) => ({ ...conceptRow, id, canonicalKey: key, name: key })
    await seedLibrary(db, {
      ...fresh,
      concepts: [...fresh.concepts, stale(kept, 'stale_kept'), stale(dropped, 'stale_dropped')],
      occurrences: [
        ...fresh.occurrences,
        { ...occurrence, conceptId: kept },
        { ...occurrence, conceptId: dropped },
      ],
      edges: [
        ...fresh.edges,
        { ...fresh.edges[0]!, id: staleEdge, fromConceptId: dropped, toConceptId: hashTables },
      ],
      items: [
        ...fresh.items,
        { ...template, id: usedItem, conceptId: kept, variant: 1 },
        { ...template, id: unusedItem, variant: 3 },
      ],
      itemSecrets: [
        ...fresh.itemSecrets,
        { ...secret, itemId: usedItem },
        { ...secret, itemId: unusedItem },
      ],
    })
    const user = '00000000-0000-4000-8000-00000000a77e'
    await db.$client.query(`INSERT INTO profiles (id, kind) VALUES ($1, 'sample')`, [user])
    await db.$client.query(
      `INSERT INTO attempts (id, user_id, concept_id, activity_type, item_id, response, grading,
                             score, max_score, outcome)
       VALUES ($1, $2, $3, 'diagnostic', $4, '{}', '{"checks":null,"criteria":[],"rationale":null}',
               1, 1, 'correct')`,
      [seedId('test:prune-attempt'), user, kept, usedItem],
    )

    await seedLibrary(db)

    const status = async (id: string) =>
      (await rows<{ status: string }>(db, 'SELECT status FROM items WHERE id = $1', [id]))[0]
        ?.status
    expect(await status(usedItem)).toBe('retired')
    expect(await status(unusedItem)).toBeUndefined()
    const attemptsLeft = await rows<{ n: number }>(
      db,
      'SELECT count(*)::int AS n FROM attempts WHERE item_id = $1',
      [usedItem],
    )
    expect(attemptsLeft[0]?.n).toBe(1)
    const concepts = await rows<{ id: string; canonical_key: string }>(
      db,
      'SELECT id, canonical_key FROM concepts',
    )
    const keys = concepts.map((c) => c.canonical_key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain('stale_kept')
    expect(keys).not.toContain('stale_dropped')
    expect(concepts).toHaveLength(fresh.concepts.length + 1)
    const edges = await rows<{ id: string }>(db, 'SELECT id FROM concept_edges')
    expect(edges.map((e) => e.id).sort()).toEqual(fresh.edges.map((e) => e.id!).sort())
    const occurrences = await rows<{ n: number }>(
      db,
      'SELECT count(*)::int AS n FROM concept_occurrences',
    )
    expect(occurrences[0]?.n).toBe(fresh.occurrences.length)
    const served = await rows<{ id: string }>(db, `SELECT id FROM items WHERE status = 'verified'`)
    expect(served.map((i) => i.id).sort()).toEqual(fresh.items.map((i) => i.id!).sort())
  }, 60_000)
})
