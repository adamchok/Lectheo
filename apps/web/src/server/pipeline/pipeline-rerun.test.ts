import { uuidv7 } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTOR_A, addAttempt, ID } from '../courses/test-fixtures'
import { postMarkers } from '../lectures/markers'
import type { DbLike } from '../db'
import { claimLecture, refundReprocess, STALE_MINUTES } from './claim'
import { validateGraphStep } from './graph'
import { addLecture, createPipelineFixture, rows, type PipelineFixture } from './test-fixture'
import { processLecture } from './workflow'

/* Re-runs, fresh runs, stale claims and edge cases (PR #8 review). */

vi.mock('server-only', () => ({}))

let current: DbLike
vi.mock('../db', async (orig) => ({
  ...(await orig<typeof import('../db')>()),
  appDb: () => current,
}))
vi.mock('../storage', async (orig) => ({
  ...(await orig<typeof import('../storage')>()),
  createDownloadUrl: vi.fn(async () => 'https://storage.test/audio'),
  deleteObjects: vi.fn(async () => {}),
}))

// Storage listing for re-parse: name → { updated_at, text }.
const bucket = vi.hoisted(() => ({
  files: {} as Record<string, { updated_at: string; text: string }>,
}))
vi.mock('../supabase', () => ({
  supabaseAdmin: () => ({
    storage: {
      from: () => ({
        list: async () => ({
          data: Object.entries(bucket.files).map(([name, f]) => ({ name, ...f })),
          error: null,
        }),
        download: async (path: string) => {
          const name = path.split('/').pop() ?? ''
          const text = bucket.files[name]?.text
          return text === undefined
            ? { data: null, error: new Error('missing') }
            : { data: new Blob([text]), error: null }
        },
      }),
    },
  }),
}))

// Lets a test make the extraction fake return nothing (an admin session, F2.9).
const extraction = vi.hoisted(() => ({ empty: false }))
vi.mock('@lectheo/ai', async (orig) => {
  const ai = await orig<typeof import('@lectheo/ai')>()
  return {
    ...ai,
    extractConceptsTask: {
      ...ai.extractConceptsTask,
      fake: (input: Parameters<typeof ai.extractConceptsTask.fake>[0]) =>
        extraction.empty
          ? { concepts: [], edges: [], chapters: [] }
          : ai.extractConceptsTask.fake(input),
    },
  }
})

let f: PipelineFixture

beforeEach(async () => {
  f = await createPipelineFixture()
  current = f.db
  bucket.files = {}
  extraction.empty = false
})

const status = async (id = f.lectureId) =>
  (
    await rows<{ status: string; error: { code: string } | null }>(
      f,
      `SELECT status, error FROM lectures WHERE id = '${id}'`,
    )
  )[0]

const reprocessUsed = async (): Promise<number> =>
  (
    await rows<{ count: number }>(
      f,
      `SELECT count FROM usage_counters WHERE user_id = '${ID.A}' AND metric = 'reprocess'`,
    )
  )[0]?.count ?? 0

const extractedAt = async (): Promise<string | undefined> =>
  (
    await rows<{ at: string }>(
      f,
      `SELECT updated_at::text AS at FROM pipeline_steps
        WHERE lecture_id = '${f.lectureId}' AND step = 'extractConcepts'`,
    )
  )[0]?.at

async function runFull(): Promise<void> {
  await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
  expect(await processLecture(f.lectureId)).toBe('ready')
}

describe('fresh run after a new upload', () => {
  it('re-extracts instead of reusing the old run, without charging a re-run', async () => {
    await runFull()
    const before = await extractedAt()
    const [practised] = await rows<{ id: string; concept_id: string }>(
      f,
      `SELECT id, concept_id FROM items WHERE lecture_id = '${f.lectureId}' LIMIT 1`,
    )
    await addAttempt(f, {
      userId: ID.A,
      conceptId: practised?.concept_id ?? '',
      itemId: practised?.id,
      activityType: 'diagnostic',
      outcome: 'correct',
    })
    // capture-import: new transcript replaces the segments and puts the lecture back to draft.
    await f.exec(`UPDATE lectures SET status = 'draft' WHERE id = '${f.lectureId}';
      UPDATE transcript_segments SET text = 'Stacks are last in, first out.'
        WHERE lecture_id = '${f.lectureId}'`)
    await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
    expect(
      await rows(f, `SELECT 1 FROM pipeline_steps WHERE lecture_id = '${f.lectureId}'`),
    ).toEqual([])
    expect(await processLecture(f.lectureId)).toBe('ready')
    expect(await extractedAt()).not.toBe(before)
    // Old items are retired; unpractised ones may go with their orphaned concepts, but an item
    // someone answered is never deleted (Data Model invariant 6).
    const [kept] = await rows<{ status: string }>(
      f,
      `SELECT status FROM items WHERE id = '${practised?.id}'`,
    )
    expect(kept).toEqual({ status: 'retired' })
    const live = await rows(
      f,
      `SELECT 1 FROM items WHERE lecture_id = '${f.lectureId}' AND status = 'verified'`,
    )
    expect(live).toHaveLength(12)
    expect(await reprocessUsed()).toBe(0)
  })

  it('keeps an orphaned concept that has a practice activity', async () => {
    await runFull()
    const [concept] = await rows<{ id: string }>(
      f,
      `SELECT concept_id AS id FROM concept_occurrences WHERE lecture_id = '${f.lectureId}' LIMIT 1`,
    )
    await f.exec(`INSERT INTO activities (id, user_id, concept_id, type, status)
      VALUES (gen_random_uuid(), '${ID.A}', '${concept?.id}', 'teach_back', 'active');
      UPDATE lectures SET status = 'draft' WHERE id = '${f.lectureId}'`)
    await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
    expect(await rows(f, `SELECT 1 FROM concepts WHERE id = '${concept?.id}'`)).toHaveLength(1)
  })

  it('a failed lecture claimed without ?from resumes (done steps are kept)', async () => {
    await runFull()
    const before = await extractedAt()
    await f.exec(`UPDATE lectures SET status = 'failed' WHERE id = '${f.lectureId}'`)
    await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
    expect(await processLecture(f.lectureId)).toBe('ready')
    expect(await extractedAt()).toBe(before)
  })
})

describe('claims', () => {
  it('map_ready (still drafting) is claimable only with ?from', async () => {
    await f.exec(`UPDATE lectures SET status = 'map_ready' WHERE id = '${f.lectureId}'`)
    await expect(claimLecture(ACTOR_A, f.lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'already_processing',
    })
    await expect(claimLecture(ACTOR_A, f.lectureId, 'draftItems', f.db)).resolves.toMatchObject({
      reprocessCharged: true,
    })
  })

  it('a losing claim is not charged a re-run, and a refund gives one back', async () => {
    await f.exec(`UPDATE lectures SET status = 'processing' WHERE id = '${f.lectureId}'`)
    await expect(claimLecture(ACTOR_A, f.lectureId, 'draftItems', f.db)).rejects.toMatchObject({
      code: 'already_processing',
    })
    expect(await reprocessUsed()).toBe(0)
    await f.exec(`UPDATE lectures SET status = 'ready' WHERE id = '${f.lectureId}'`)
    await claimLecture(ACTOR_A, f.lectureId, 'draftItems', f.db)
    expect(await reprocessUsed()).toBe(1)
    await refundReprocess(ACTOR_A, f.db)
    expect(await reprocessUsed()).toBe(0)
  })

  it('a stalled run is failed so it no longer blocks the lecture or its course', async () => {
    const stuck = uuidv7()
    await addLecture(f, stuck)
    await f.exec(`UPDATE lectures SET status = 'processing',
        progress = '{"step":"draftItems","done":5,"total":7}',
        updated_at = now() - interval '${STALE_MINUTES + 1} minutes'
      WHERE id = '${stuck}'`)
    // Another lecture in the same course can start…
    await claimLecture(ACTOR_A, f.lectureId, undefined, f.db)
    expect(await status(stuck)).toMatchObject({
      status: 'failed',
      error: { step: 'draftItems', code: 'stalled' },
    })
    // …and the stalled one can be retried.
    await f.exec(`UPDATE lectures SET status = 'ready' WHERE id = '${f.lectureId}'`)
    await expect(claimLecture(ACTOR_A, stuck, undefined, f.db)).resolves.toBeDefined()
  })

  it('a run that is still writing progress is never treated as stalled', async () => {
    const busy = uuidv7()
    await addLecture(f, busy)
    await f.exec(`UPDATE lectures SET status = 'processing' WHERE id = '${busy}'`)
    await expect(claimLecture(ACTOR_A, f.lectureId, undefined, f.db)).rejects.toMatchObject({
      code: 'already_processing',
    })
    expect(await status(busy)).toMatchObject({ status: 'processing' })
  })
})

describe('re-run edge cases', () => {
  it('a re-run re-links study marks by what they name, not by time (F9.4, F11.4)', async () => {
    await runFull()
    const [lecture] = await rows<{ chapters: { id: string; conceptIds: string[] }[] }>(
      f,
      `SELECT chapters FROM lectures WHERE id = '${f.lectureId}'`,
    )
    const chapter = lecture?.chapters.find((c) => c.conceptIds.length > 1)
    const concept = chapter?.conceptIds.at(-1) ?? ''
    expect(chapter).toBeDefined()
    const conceptMark = {
      id: uuidv7(),
      kind: 'lost' as const,
      capture: 'study' as const,
      conceptId: concept,
    }
    const chapterMark = {
      id: uuidv7(),
      kind: 'important' as const,
      capture: 'study' as const,
      chapterId: chapter?.id ?? '',
    }
    await postMarkers(ACTOR_A, f.lectureId, [conceptMark, chapterMark], f.db)

    await claimLecture(ACTOR_A, f.lectureId, 'extractConcepts', f.db)
    expect(await processLecture(f.lectureId)).toBe('ready')

    const linked = async (markerId: string) =>
      (
        await rows<{ concept_id: string }>(
          f,
          `SELECT concept_id FROM marker_concepts WHERE marker_id = '${markerId}'`,
        )
      )
        .map((r) => r.concept_id)
        .sort()
    expect(await linked(conceptMark.id)).toEqual([concept])
    expect(await linked(chapterMark.id)).toEqual([...(chapter?.conceptIds ?? [])].sort())
  })

  it('an edge reversed by a re-run is not a cycle with its own old edge', async () => {
    await runFull()
    const [edge] = await rows<{ from_key: string; to_key: string }>(
      f,
      `SELECT cf.canonical_key AS from_key, ct.canonical_key AS to_key FROM concept_edges e
        JOIN concepts cf ON cf.id = e.from_concept_id JOIN concepts ct ON ct.id = e.to_concept_id
        WHERE e.lecture_id = '${f.lectureId}' AND e.relation = 'depends_on' LIMIT 1`,
    )
    expect(edge).toBeDefined()
    const [step] = await rows<{ output: { extraction: { edges: unknown[] } } }>(
      f,
      `SELECT output FROM pipeline_steps
        WHERE lecture_id = '${f.lectureId}' AND step = 'extractConcepts'`,
    )
    const reversed = {
      ...step?.output,
      extraction: {
        ...step?.output.extraction,
        edges: [
          {
            fromKey: edge?.to_key,
            toKey: edge?.from_key,
            relation: 'depends_on',
            segmentIdxs: [0],
          },
        ],
      },
    }
    await f.exec(`UPDATE pipeline_steps SET output = '${JSON.stringify(reversed)}'::jsonb
        WHERE lecture_id = '${f.lectureId}' AND step = 'extractConcepts';
      DELETE FROM pipeline_steps WHERE lecture_id = '${f.lectureId}' AND step = 'validateGraph'`)
    await expect(validateGraphStep(f.db, f.lectureId)).resolves.toMatchObject({ edges: 1 })
  })

  it('a lecture with no concepts reaches ready with no items (F2.9)', async () => {
    extraction.empty = true
    await runFull()
    expect(await rows(f, `SELECT 1 FROM items WHERE lecture_id = '${f.lectureId}'`)).toEqual([])
    expect(
      await rows(f, `SELECT 1 FROM concept_occurrences WHERE lecture_id = '${f.lectureId}'`),
    ).toEqual([])
  })

  it('bills pipeline LLM calls to the lecture owner', async () => {
    await runFull()
    const owners = await rows<{ user_id: string | null }>(
      f,
      `SELECT DISTINCT user_id FROM llm_calls WHERE lecture_id = '${f.lectureId}'`,
    )
    expect(owners).toEqual([{ user_id: ID.A }])
  })

  it('?from=parseTranscript re-parses the newest uploaded file', async () => {
    await runFull()
    const vtt = (text: string) => `WEBVTT\n\n00:00:00.000 --> 00:00:30.000\n${text}\n`
    bucket.files = {
      [`${f.lectureId}.srt`]: {
        updated_at: '2026-10-01T00:00:00Z',
        text: '1\n00:00:00,000 --> 00:00:30,000\nOld transcript.\n',
      },
      [`${f.lectureId}.vtt`]: { updated_at: '2026-10-02T00:00:00Z', text: vtt('New transcript.') },
    }
    await claimLecture(ACTOR_A, f.lectureId, 'parseTranscript', f.db)
    expect(await processLecture(f.lectureId)).toBe('ready')
    const segments = await rows<{ text: string }>(
      f,
      `SELECT text FROM transcript_segments WHERE lecture_id = '${f.lectureId}'`,
    )
    expect(segments).toEqual([{ text: 'New transcript.' }])
  })
})
