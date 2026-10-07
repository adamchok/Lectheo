import { lectures, uuidv7 } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, ACTOR_B, ID } from '../courses/test-fixtures'
import type { DbLike } from '../db'
import { claimLecture } from './claim'
import { explainConceptsStep } from './explain'
import { extractConceptsStep, validateGraphStep } from './graph'
import { draftItemsStep, verifyItemsStep } from './items'
import { runStep } from './state'
import { addLecture, createPipelineFixture, rows, type PipelineFixture } from './test-fixture'
import { processLecture } from './workflow'

vi.mock('server-only', () => ({}))

// Lets a test make explainConcepts calls fail (F9.15) while every other task stays fake.
const explainFails = vi.hoisted(() => ({
  on: false,
  calls: 0,
  /** Fails only this explain call (1-based); that batch's size goes in `failedSize`. */
  failCall: 0,
  failedSize: 0,
}))
vi.mock('@lectheo/ai', async (orig) => {
  const ai = await orig<typeof import('@lectheo/ai')>()
  const runTask: typeof ai.runTask = async (task, input, ctx) => {
    if (task.name === 'explain-concepts') {
      explainFails.calls += 1
      if (explainFails.on) throw new Error('model down')
      if (explainFails.calls === explainFails.failCall) {
        explainFails.failedSize = (input as { concepts: unknown[] }).concepts.length
        throw new Error('model down')
      }
    }
    return ai.runTask(task, input, ctx)
  }
  return { ...ai, runTask }
})

// Steps resolve the database through appDb(); point it at this test's PGlite instance.
let current: DbLike
vi.mock('../db', async (orig) => ({
  ...(await orig<typeof import('../db')>()),
  appDb: () => current,
}))

const storage = vi.hoisted(() => ({
  createDownloadUrl: vi.fn(async () => 'https://storage.test/audio?token=x'),
  deleteObjects: vi.fn(async () => {}),
}))
vi.mock('../storage', async (orig) => ({
  ...(await orig<typeof import('../storage')>()),
  ...storage,
}))
vi.mock('../supabase', () => ({
  supabaseAdmin: () => ({
    storage: { from: () => ({ list: async () => ({ data: [], error: null }) }) },
  }),
}))

let f: PipelineFixture

beforeEach(async () => {
  f = await createPipelineFixture()
  current = f.db
  Object.assign(explainFails, { on: false, calls: 0, failCall: 0, failedSize: 0 })
  vi.clearAllMocks()
})

interface LectureRow {
  status: string
  error: unknown
  progress: unknown
  audio_path: string | null
}

const lecture = async (id = f.lectureId): Promise<LectureRow | undefined> =>
  (
    await rows<LectureRow>(
      f,
      `SELECT status, error, progress, audio_path FROM lectures WHERE id = '${id}'`,
    )
  )[0]

const itemCounts = async (): Promise<Record<string, number>> =>
  Object.fromEntries(
    (
      await rows<{ status: string; n: number }>(
        f,
        `SELECT status, count(*)::int AS n FROM items
          WHERE lecture_id = '${f.lectureId}' GROUP BY status`,
      )
    ).map((r) => [r.status, r.n]),
  )

const stepNames = async (): Promise<string[]> =>
  (
    await rows<{ step: string }>(
      f,
      `SELECT step FROM pipeline_steps WHERE lecture_id = '${f.lectureId}' ORDER BY step`,
    )
  ).map((r) => r.step)

async function runFull(): Promise<void> {
  await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
  expect(await processLecture(f.lectureId)).toBe('ready')
}

describe('processLecture with AI_FAKE', () => {
  it('takes a transcript lecture to ready with verified items and a stored layout', async () => {
    await runFull()
    expect(await lecture()).toMatchObject({
      status: 'ready',
      error: null,
      progress: { step: null, done: 7, total: 7 },
    })
    // 12 × 40 s = 8 min → 3 concepts; MCQ ×2 each + spot-the-flaw ×2 for the top 3.
    const concepts = await rows<{ id: string }>(
      f,
      `SELECT concept_id AS id FROM concept_occurrences WHERE lecture_id = '${f.lectureId}'`,
    )
    expect(concepts).toHaveLength(3)
    // F11: 8 min → 1..3 chapters; the fake splits at s0 and s6, the last a concept-free recap.
    const [stored] = await rows<{ chapters: { startIdx: number; conceptIds: string[] }[] }>(
      f,
      `SELECT chapters FROM lectures WHERE id = '${f.lectureId}'`,
    )
    expect(stored?.chapters.map((c) => [c.startIdx, c.conceptIds.length])).toEqual([
      [0, 3],
      [6, 0],
    ])
    expect(await itemCounts()).toEqual({ verified: 12 })
    const [course] = await rows<{ layout: Record<string, unknown>; layout_hash: string }>(
      f,
      `SELECT layout, layout_hash FROM courses WHERE id = '${ID.P}'`,
    )
    expect(course?.layout_hash).toMatch(/^[0-9a-f]{64}$/)
    for (const c of concepts) {
      expect(course?.layout[c.id]).toEqual({ x: expect.any(Number), y: expect.any(Number) })
    }
    const secrets = await rows(
      f,
      `SELECT 1 FROM item_secrets s JOIN items i ON i.id = s.item_id
        WHERE i.lecture_id = '${f.lectureId}'`,
    )
    expect(secrets).toHaveLength(12)
  })

  it('takes an audio lecture to ready and deletes the audio object', async () => {
    const audioId = uuidv7()
    await f.exec(`DELETE FROM lectures WHERE id = '${f.lectureId}'`)
    await addLecture(f, audioId, { source: 'audio', segments: 0, audioPath: `${ID.A}/${audioId}` })
    await claimLecture(ACTOR_A, audioId, undefined, f.db)
    expect(await processLecture(audioId)).toBe('ready')
    expect(await lecture(audioId)).toMatchObject({ status: 'ready', audio_path: null })
    expect(storage.deleteObjects).toHaveBeenCalledWith('audio', [`${ID.A}/${audioId}`])
    const segments = await rows(
      f,
      `SELECT 1 FROM transcript_segments WHERE lecture_id = '${audioId}'`,
    )
    expect(segments.length).toBeGreaterThan(0)
  })

  it('links markers captured before processing to the new concepts', async () => {
    await f.exec(`INSERT INTO markers (id, lecture_id, user_id, kind, t_ms, capture)
      VALUES ('${uuidv7()}', '${f.lectureId}', '${ID.A}', 'lost', 60000, 'watch')`)
    await runFull()
    const links = await rows(
      f,
      `SELECT mc.concept_id FROM marker_concepts mc
        JOIN markers m ON m.id = mc.marker_id WHERE m.lecture_id = '${f.lectureId}'`,
    )
    expect(links).toHaveLength(1)
  })

  it('fails with the step and its reason when there is no transcript', async () => {
    await f.exec(`DELETE FROM transcript_segments WHERE lecture_id = '${f.lectureId}'`)
    await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
    expect(await processLecture(f.lectureId)).toBe('failed')
    expect(await lecture()).toMatchObject({
      status: 'failed',
      error: { step: 'parseTranscript', code: 'no_transcript' },
    })
  })
})

interface DepthRow {
  first: boolean
  depth: { howItWorks: { cites: number[] }[] } | null
}

/** concepts.depth of the course's concepts, flagged by whether this lecture introduced them. */
const depths = async (): Promise<DepthRow[]> =>
  rows<DepthRow>(
    f,
    `SELECT c.first_lecture_id = '${f.lectureId}' AS first, c.depth FROM concepts c
      WHERE c.course_id = '${ID.P}' ORDER BY c.canonical_key`,
  )

describe('explainConcepts (F9.13–F9.15)', () => {
  it('runs beside the item steps and writes depth for the concepts this lecture introduces', async () => {
    await runFull()
    expect(await stepNames()).toContain('explainConcepts')
    const all = await depths()
    expect(all.filter((r) => r.first)).toHaveLength(3)
    const segments = new Set(Array.from({ length: 12 }, (_, i) => i))
    for (const row of all.filter((r) => r.first)) {
      expect(row.depth?.howItWorks.length).toBeGreaterThanOrEqual(2)
      row.depth?.howItWorks.forEach((p) => expect(p.cites.every((i) => segments.has(i))).toBe(true))
    }
    // PC1/PC2 belong to earlier lectures: never written from this one.
    expect(all.filter((r) => !r.first).map((r) => r.depth)).toEqual([null, null])
    // The step stays off the progress path.
    expect(await lecture()).toMatchObject({ progress: { step: null, done: 7, total: 7 } })
  })

  it('a failed call still turns the lecture ready, without depth', async () => {
    explainFails.on = true
    await runFull()
    expect(await lecture()).toMatchObject({ status: 'ready', error: null })
    expect(await itemCounts()).toEqual({ verified: 12 })
    expect((await depths()).every((r) => r.depth === null)).toBe(true)
  })

  it('explains a long lecture in batches; a failed batch only drops its own concepts', async () => {
    await runFull()
    const kp = JSON.stringify([
      { id: 'k1', text: 'one', segmentIdxs: [1] },
      { id: 'k2', text: 'two', segmentIdxs: [2] },
    ])
    const extra = Array.from({ length: 17 }, (_, i) => ({ id: uuidv7(), key: `extra-${i}` }))
    const conceptRows = extra.map(
      (c) => `('${c.id}', '${ID.P}', '${c.key}', '${c.key}', 's', '${kp}', '${f.lectureId}')`,
    )
    const occurrenceRows = extra.map((c) => `('${c.id}', '${f.lectureId}', '{1}', 0.5)`)
    await f.exec(`
      INSERT INTO concepts (id, course_id, name, canonical_key, summary, key_points, first_lecture_id)
        VALUES ${conceptRows.join(',')};
      INSERT INTO concept_occurrences (concept_id, lecture_id, segment_idxs, salience)
        VALUES ${occurrenceRows.join(',')};
      DELETE FROM pipeline_steps WHERE lecture_id = '${f.lectureId}' AND step = 'explainConcepts';
    `)
    Object.assign(explainFails, { calls: 0, failCall: 2 })
    const out = await explainConceptsStep(f.db, f.lectureId)
    // 20 concepts in batches of 6 → 4 calls; the second one fails.
    expect(explainFails.calls).toBe(4)
    expect(explainFails.failedSize).toBeGreaterThan(0)
    expect(out).toEqual({ concepts: 20, explained: 20 - explainFails.failedSize })
    const written = (await depths()).filter((r) => r.first && r.depth !== null)
    expect(written).toHaveLength(20 - explainFails.failedSize)
  })

  it('re-processing replaces the depth', async () => {
    await runFull()
    await f.exec(`
      UPDATE concepts SET depth = '{"stale": true}'::jsonb WHERE first_lecture_id = '${f.lectureId}';
      DELETE FROM pipeline_steps WHERE lecture_id = '${f.lectureId}' AND step = 'explainConcepts';
    `)
    await explainConceptsStep(f.db, f.lectureId)
    const mine = (await depths()).filter((r) => r.first)
    expect(mine.length).toBeGreaterThan(0)
    mine.forEach((r) => expect(r.depth).not.toHaveProperty('stale'))
  })
})

describe('steps are idempotent', () => {
  it('a finished step returns its stored output and writes nothing', async () => {
    await runFull()
    expect(await draftItemsStep(f.db, f.lectureId)).toEqual({ concepts: 3, items: 12 })
    expect(await itemCounts()).toEqual({ verified: 12 })
  })

  it('cleared steps re-run without duplicating concepts or items', async () => {
    await runFull()
    await f.exec(`DELETE FROM pipeline_steps WHERE lecture_id = '${f.lectureId}'`)
    await extractConceptsStep(f.db, f.lectureId)
    expect(await validateGraphStep(f.db, f.lectureId)).toMatchObject({ concepts: 3, reused: 3 })
    expect(await draftItemsStep(f.db, f.lectureId)).toEqual({ concepts: 3, items: 0 })
    await verifyItemsStep(f.db, f.lectureId)
    const concepts = await rows(f, `SELECT 1 FROM concepts WHERE course_id = '${ID.P}'`)
    expect(concepts).toHaveLength(5) // PC1, PC2 + 3 new
    expect(await itemCounts()).toEqual({ verified: 12 })
  })
})

describe('claim (POST /process)', () => {
  it('lets exactly one of two concurrent claims win; the other is 409', async () => {
    const results = await Promise.allSettled([
      claimLecture(ACTOR_A, f.lectureId, undefined, f.db),
      claimLecture(ACTOR_A, f.lectureId, undefined, f.db),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(rejected?.reason).toMatchObject({ code: 'already_processing', status: 409 })
  })

  it('allows one processing lecture per course', async () => {
    const other = uuidv7()
    await addLecture(f, other)
    await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
    await expect(claimLecture(ACTOR_A, other, undefined, f.db)).rejects.toMatchObject({
      code: 'already_processing',
      status: 409,
    })
  })

  it('is 404 for another user and 503 while intake is paused', async () => {
    await expect(claimLecture(ACTOR_B, f.lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'not_found',
    })
    await f.exec(`INSERT INTO app_flags (id, intake_paused) VALUES (1, true)
      ON CONFLICT (id) DO UPDATE SET intake_paused = true`)
    await expect(claimLecture(ACTOR_A, f.lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'intake_paused',
      status: 503,
    })
  })

  it('?from clears that step and later ones, and the re-run retires old items', async () => {
    await runFull()
    await claimLecture(ACTOR_A, f.lectureId, 'draftItems', f.db)
    expect(await stepNames()).toEqual([
      'alignMarkers',
      'extractConcepts',
      'layoutMap',
      'parseTranscript',
      'validateGraph',
    ])
    expect(await itemCounts()).toEqual({ retired: 12 })
    expect(await processLecture(f.lectureId)).toBe('ready')
    expect(await itemCounts()).toEqual({ retired: 12, verified: 12 })
    const [quota] = await rows<{ count: number }>(
      f,
      `SELECT count FROM usage_counters WHERE user_id = '${ID.A}' AND metric = 'reprocess'`,
    )
    expect(quota?.count).toBe(1)
  })

  it('rejects a ?from step that does not fit the source', async () => {
    await expect(
      claimLecture(ACTOR_A, f.lectureId, 'submitTranscription', f.db),
    ).rejects.toMatchObject({ code: 'invalid_state' })
  })
})

describe('runStep errors', () => {
  it('never re-throws a failed query with its params (the workflow runtime logs it)', async () => {
    const secret = 'SECRET-TRANSCRIPT-LINE'
    // A real DrizzleQueryError: a duplicate lecture id, with the secret among the params.
    const failing = () =>
      f.db.insert(lectures).values({
        id: f.lectureId,
        courseId: ID.P,
        title: secret,
        seq: 9,
        source: 'transcript',
      })
    const thrown = await runStep(f.db, f.lectureId, 'parseTranscript', failing).catch((e) => e)
    expect(thrown).toBeInstanceOf(Error)
    expect(String(thrown.message)).not.toContain(secret)
    expect(String(thrown.message)).toContain('duplicate key')
  })
})
