import { BriefResponse, type MarkerBody } from '@lectheo/contracts'
import { uuidv7 } from '@lectheo/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTOR_A,
  ACTOR_B,
  ACTOR_G,
  createFixture,
  type Fixture,
  ID,
  SECRET_KEY_POINT,
} from '../courses/test-fixtures'
import { getBrief } from './brief'
import { deleteMarker, listMarkers, postMarkers } from './markers'
import { getLecture } from './read'

vi.mock('server-only', () => ({}))

/*
 * Study mode (F9) and chapters (F11) on the course fixture. L1 gets four 40 s segments:
 * s0 = C1, s1–s2 = C2, s3 = a Q&A without concepts; chapters ch1 (s0, C1), ch2 (s1–s2, C2) and
 * ch3 (s3, none). C1 depends_on C2, so C2 comes first even though C1 appears first.
 */

const SECRET_ANSWER = 'SECRET-ANSWER-KEY'
const CHAPTERS = [
  {
    id: 'ch1',
    title: 'Types',
    summary: 'What a type is.',
    startIdx: 0,
    endIdx: 0,
    conceptIds: [ID.C1],
  },
  { id: 'ch2', title: 'Loops', summary: 'Repeating.', startIdx: 1, endIdx: 2, conceptIds: [ID.C2] },
  { id: 'ch3', title: 'Q&A', summary: 'Questions.', startIdx: 3, endIdx: 3, conceptIds: [] },
]

/** concepts.depth for C2 (F9.13); the second paragraph cites a segment that no longer exists. */
const DEPTH = {
  howItWorks: [
    { text: 'A loop repeats its body while a condition holds.', cites: [1, 2] },
    { text: 'Each pass checks the condition.', cites: [99] },
  ],
  example: { text: 'Count to three.', code: 'for (int i = 0; i < 3; i++)', beyondLecture: true },
  mistakes: [
    { mistake: 'Off by one', why: 'The bound is exclusive.' },
    { mistake: 'Infinite loop', why: 'The condition never turns false.' },
  ],
}

let f: Fixture

beforeEach(async () => {
  f = await createFixture()
  await f.exec(`
    INSERT INTO transcript_segments (lecture_id, idx, start_ms, end_ms, text) VALUES
      ('${ID.L1}', 0, 0, 40000, 'types'), ('${ID.L1}', 1, 40000, 80000, 'loops'),
      ('${ID.L1}', 2, 80000, 120000, 'more loops'), ('${ID.L1}', 3, 120000, 160000, 'questions'),
      ('${ID.L2}', 0, 0, 30000, 'loops again'), ('${ID.L2}', 1, 30000, 60000, 'arrays');
    UPDATE concept_occurrences SET segment_idxs = '{2,1}'
      WHERE concept_id = '${ID.C2}' AND lecture_id = '${ID.L1}';
    INSERT INTO concept_edges (id, course_id, from_concept_id, to_concept_id, relation, segment_idxs)
      VALUES ('${uuidv7()}', '${ID.LIB}', '${ID.C1}', '${ID.C2}', 'depends_on', '{0}');
    UPDATE lectures SET chapters = '${JSON.stringify(CHAPTERS)}'::jsonb WHERE id = '${ID.L1}';
    INSERT INTO item_secrets (item_id, answer_key, leak_keywords)
      VALUES ('${ID.ITEM}', '{"correctOptionId":"${SECRET_ANSWER}"}', '{"${SECRET_ANSWER}"}');
  `)
})

const conceptMark = (conceptId: string, kind: 'lost' | 'important' = 'lost'): MarkerBody => ({
  id: uuidv7(),
  kind,
  capture: 'study',
  conceptId,
})
const chapterMark = (chapterId: string): MarkerBody => ({
  id: uuidv7(),
  kind: 'lost',
  capture: 'study',
  chapterId,
})
const links = async (markerId: string) =>
  (
    await f.testDb.$client.query<{ concept_id: string; overlap_score: number }>(
      `SELECT concept_id, overlap_score FROM marker_concepts WHERE marker_id = '${markerId}'
        ORDER BY concept_id`,
    )
  ).rows

describe('GET /lectures/{id}/brief', () => {
  it('lists concepts by chapter with key points, clips, chapter and prerequisites', async () => {
    const brief = BriefResponse.parse(await getBrief(ACTOR_A, ID.L1, f.db))
    // F9.10: Types first appears in ch1, so it leads although it builds on Loops.
    expect(brief.concepts.map((c) => c.name)).toEqual(['Types', 'Loops'])
    const [types, loops] = brief.concepts
    expect(loops).toEqual({
      id: ID.C2,
      name: 'Loops',
      mastery: { state: 'gray', confidentMistake: false },
      prerequisites: [],
      summary: 'Repetition',
      keyPoints: [
        {
          id: 'k1',
          text: SECRET_KEY_POINT,
          sources: [{ lectureId: ID.L1, idx: 0, startMs: 0, excerpt: 'types' }],
        },
      ],
      clips: [{ startMs: 40_000, endMs: 120_000 }],
      clipMs: 80_000,
      chapter: { id: 'ch2', title: 'Loops', startMs: 40_000 },
      marks: { lost: 0, important: 0 },
      depth: null,
      alsoIn: [],
    })
    expect(types?.prerequisites).toEqual([{ id: ID.C2, name: 'Loops' }])
    expect(types?.chapter).toEqual({ id: 'ch1', title: 'Types', startMs: 0 })
    // Names, summaries and key points are a handful of words: 1 minute. No media → no video.
    expect(brief).toMatchObject({
      lectureId: ID.L1,
      readMinutes: 1,
      depthMinutes: 0,
      videoMinutes: null,
    })
  })

  it('keeps learning order without chapters and lists later chapters that revisit', async () => {
    await f.exec(`UPDATE concept_occurrences SET segment_idxs = '{0,3}'
      WHERE concept_id = '${ID.C1}' AND lecture_id = '${ID.L1}'`)
    const withChapters = await getBrief(ACTOR_A, ID.L1, f.db)
    expect(withChapters.concepts.find((c) => c.id === ID.C1)?.alsoIn).toEqual(['ch3'])
    await f.exec(`UPDATE lectures SET chapters = NULL WHERE id = '${ID.L1}'`)
    const flat = await getBrief(ACTOR_A, ID.L1, f.db)
    expect(flat.concepts.map((c) => [c.name, c.chapter, c.alsoIn])).toEqual([
      ['Loops', null, []],
      ['Types', null, []],
    ])
  })

  it('shows stored depth with lecture links, connects from the map and reading time', async () => {
    await f.exec(`UPDATE concepts SET depth = '${JSON.stringify(DEPTH)}'::jsonb
      WHERE id = '${ID.C2}'`)
    const brief = BriefResponse.parse(await getBrief(ACTOR_A, ID.L1, f.db))
    const loops = brief.concepts.find((c) => c.id === ID.C2)
    expect(loops?.depth).toEqual({
      howItWorks: [
        {
          text: DEPTH.howItWorks[0]?.text,
          sources: [
            { lectureId: ID.L1, idx: 1, startMs: 40_000, excerpt: 'loops' },
            { lectureId: ID.L1, idx: 2, startMs: 80_000, excerpt: 'more loops' },
          ],
        },
        { text: 'Each pass checks the condition.', sources: [] },
      ],
      example: DEPTH.example,
      mistakes: DEPTH.mistakes,
      // Types depends on Loops, so Loops leads to it.
      connects: [{ id: ID.C1, name: 'Types', relation: 'leads_to' }],
      readMinutes: 1,
    })
    // F9.13: hidden (null) where nothing was written.
    expect(brief.concepts.find((c) => c.id === ID.C1)?.depth).toBeNull()
    expect(brief.depthMinutes).toBe(1)

    // In a later lecture the concept keeps its first lecture's depth and links there.
    const later = await getBrief(ACTOR_A, ID.L2, f.db)
    expect(later.concepts.find((c) => c.id === ID.C2)?.depth?.howItWorks[0]?.sources[0]).toEqual({
      lectureId: ID.L1,
      idx: 1,
      startMs: 40_000,
      excerpt: 'loops',
    })
  })

  it('cites key points in the lecture that introduced the concept', async () => {
    const brief = await getBrief(ACTOR_A, ID.L2, f.db)
    const loops = brief.concepts.find((c) => c.id === ID.C2)
    expect(loops?.keyPoints[0]?.sources).toEqual([
      { lectureId: ID.L1, idx: 0, startMs: 0, excerpt: 'types' },
    ])
    // C3 depends on C1, which L2 does not teach: still listed as what it builds on.
    expect(brief.concepts.find((c) => c.id === ID.C3)?.prerequisites).toEqual([
      { id: ID.C1, name: 'Types' },
    ])
  })

  it('shows key points but no other secret (ADR-009 amended)', async () => {
    const json = JSON.stringify(await getBrief(ACTOR_A, ID.L1, f.db))
    expect(json).toContain(SECRET_KEY_POINT)
    expect(json).not.toContain(SECRET_ANSWER)
    expect(json).not.toMatch(/answerKey|answer_key|leakKeywords|rubric|hints/)
  })

  it('is 404 for other users, Google accounts on the library and bad ids', async () => {
    await expect(getBrief(ACTOR_B, ID.PL1, f.db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getBrief(ACTOR_G, ID.L1, f.db)).rejects.toMatchObject({ code: 'not_found' })
    await expect(getBrief(ACTOR_A, 'nope', f.db)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('is 409 until the map exists, and available from map_ready', async () => {
    await f.exec(`UPDATE lectures SET status = 'processing' WHERE id = '${ID.PL1}'`)
    await expect(getBrief(ACTOR_A, ID.PL1, f.db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
    await f.exec(`UPDATE lectures SET status = 'map_ready' WHERE id = '${ID.PL1}'`)
    await expect(getBrief(ACTOR_A, ID.PL1, f.db)).resolves.toMatchObject({ lectureId: ID.PL1 })
  })
})

describe('study marks (F9.4, F11.4)', () => {
  it('a concept mark sits at its first source moment, linked only to that concept', async () => {
    const mark = conceptMark(ID.C2)
    expect(await postMarkers(ACTOR_A, ID.L1, [mark], f.db)).toEqual({ accepted: 1, duplicates: 0 })
    expect(await postMarkers(ACTOR_A, ID.L1, [mark], f.db)).toEqual({ accepted: 0, duplicates: 1 })
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data).toEqual([
      {
        id: mark.id,
        kind: 'lost',
        tMs: 40_000,
        capture: 'study',
        target: { conceptId: ID.C2 },
        conceptIds: [ID.C2],
      },
    ])
    expect(await links(mark.id)).toEqual([{ concept_id: ID.C2, overlap_score: 1 }])
    const brief = await getBrief(ACTOR_A, ID.L1, f.db)
    expect(brief.concepts.find((c) => c.id === ID.C2)?.marks).toEqual({ lost: 1, important: 0 })

    // Undo (the pressed toggle): gone from the list and the brief's counts.
    await deleteMarker(ACTOR_A, ID.L1, mark.id, f.db)
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data).toEqual([])
    const after = await getBrief(ACTOR_A, ID.L1, f.db)
    expect(after.concepts.find((c) => c.id === ID.C2)?.marks).toEqual({ lost: 0, important: 0 })
  })

  it('a chapter mark sits at the chapter start, linked to every concept it covers', async () => {
    await f.exec(`UPDATE lectures SET chapters = jsonb_set(chapters, '{1,conceptIds}',
      '["${ID.C2}","${ID.C1}"]') WHERE id = '${ID.L1}'`)
    const mark = chapterMark('ch2')
    await postMarkers(ACTOR_A, ID.L1, [mark], f.db)
    await postMarkers(ACTOR_A, ID.L1, [mark], f.db)
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data).toEqual([
      expect.objectContaining({
        id: mark.id,
        tMs: 40_000,
        capture: 'study',
        target: { chapterId: 'ch2' },
      }),
    ])
    expect(await links(mark.id)).toEqual(
      [ID.C1, ID.C2].sort().map((concept_id) => ({ concept_id, overlap_score: 1 })),
    )
  })

  it('404s unknown concepts and chapters, and chapters without concepts', async () => {
    for (const body of [conceptMark(ID.C3), chapterMark('ch9'), chapterMark('ch3')]) {
      await expect(postMarkers(ACTOR_A, ID.L1, [body], f.db)).rejects.toMatchObject({
        code: 'not_found',
      })
    }
    expect((await listMarkers(ACTOR_A, ID.L1, f.db)).data).toEqual([])
  })

  it('409s on a lecture without timestamps', async () => {
    await f.exec(`UPDATE lectures SET has_timestamps = false WHERE id = '${ID.L1}'`)
    await expect(postMarkers(ACTOR_A, ID.L1, [conceptMark(ID.C1)], f.db)).rejects.toMatchObject({
      code: 'invalid_state',
    })
  })
})

describe('GET /lectures/{id} chapters (F11)', () => {
  it('reads chapter times from their segments', async () => {
    const lecture = await getLecture(ACTOR_A, ID.L1, f.db)
    expect(lecture.chapters.map(({ id, startMs, endMs }) => ({ id, startMs, endMs }))).toEqual([
      { id: 'ch1', startMs: 0, endMs: 40_000 },
      { id: 'ch2', startMs: 40_000, endMs: 120_000 },
      { id: 'ch3', startMs: 120_000, endMs: 160_000 },
    ])
  })

  it('has none without timestamps', async () => {
    await f.exec(`UPDATE lectures SET has_timestamps = false WHERE id = '${ID.L1}'`)
    expect((await getLecture(ACTOR_A, ID.L1, f.db)).chapters).toEqual([])
  })
})
