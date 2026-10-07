import type { ExtractConceptsOutput } from '@lectheo/ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateGraphStep } from './graph'
import { graphErrors, planChapters, planGraph, type CourseEdge } from './graph-check'
import { createPipelineFixture, rows, type PipelineFixture } from './test-fixture'

vi.mock('server-only', () => ({}))

const concept = (canonicalKey: string, segmentIdxs = [0]) => ({
  canonicalKey,
  name: canonicalKey.replace(/-/g, ' '),
  summary: `${canonicalKey} summary`,
  salience: 0.5,
  segmentIdxs,
  keyPoints: [{ id: 'k1', text: 'point', segmentIdxs }],
})

type Edge = ExtractConceptsOutput['edges'][number]
type ExtractedChapter = ExtractConceptsOutput['chapters'][number]
const chapter = (startIdx: number, conceptKeys: string[] = []): ExtractedChapter => ({
  title: `From s${startIdx}`,
  summary: 'One line.',
  startIdx,
  conceptKeys,
})
const dependsOn = (fromKey: string, toKey: string): Edge => ({
  fromKey,
  toKey,
  relation: 'depends_on',
  segmentIdxs: [0],
})

const extraction = (
  concepts: ReturnType<typeof concept>[],
  edges: Edge[] = [],
  chapters: ExtractedChapter[] = [],
): ExtractConceptsOutput => ({ concepts, edges, chapters })

const SEGMENTS = new Set([0, 1, 2])

describe('graphErrors', () => {
  it('accepts a grounded DAG', () => {
    const plan = planGraph(
      extraction([concept('pointer'), concept('malloc')], [dependsOn('malloc', 'pointer')]),
      [],
    )
    expect(graphErrors(plan, SEGMENTS, [])).toEqual([])
  })

  it('rejects unknown and missing citations', () => {
    const plan = planGraph(extraction([concept('pointer', [7]), concept('malloc', [])]), [])
    expect(graphErrors(plan, SEGMENTS, [])).toEqual(
      expect.arrayContaining(['pointer: unknown segment s7', 'malloc: cites no segment']),
    )
  })

  it('rejects edges to concepts that do not exist', () => {
    const plan = planGraph(extraction([concept('pointer')], [dependsOn('pointer', 'ghost')]), [])
    expect(graphErrors(plan, SEGMENTS, [])).toContain('edge endpoint "ghost" is not a concept')
  })

  it('rejects a depends_on cycle, including one closed through existing course edges', () => {
    const local = planGraph(
      extraction([concept('a'), concept('b')], [dependsOn('a', 'b'), dependsOn('b', 'a')]),
      [],
    )
    expect(graphErrors(local, SEGMENTS, []).join()).toMatch(/cycle/)

    const existing = [
      { id: 'X', canonicalKey: 'arrays', name: 'Arrays' },
      { id: 'P', canonicalKey: 'pointer', name: 'Pointer' },
    ]
    const courseEdges: CourseEdge[] = [{ id: 'e1', fromId: 'X', toId: 'P', relation: 'depends_on' }]
    const crossLecture = planGraph(
      extraction([concept('pointers')], [dependsOn('pointers', 'arrays')]),
      existing,
    )
    expect(graphErrors(crossLecture, SEGMENTS, courseEdges).join()).toMatch(/cycle/)
  })

  it('dedupes by normalised key against the course and within the extraction', () => {
    const plan = planGraph(
      extraction(
        [concept('linked-lists'), concept('linked-list'), concept('stack')],
        [dependsOn('linked-lists', 'linked-list')],
      ),
      [{ id: 'LL', canonicalKey: 'linked_list', name: 'Linked list' }],
    )
    expect(plan.concepts.map((c) => c.existingId)).toEqual(['LL', null])
    // An edge between two spellings of one concept folds away instead of becoming a self-edge.
    expect(plan.edges).toEqual([])
  })
})

describe('planChapters (F11.2)', () => {
  const IDXS = [0, 1, 2, 3, 4, 5]
  const withChapters = (chapters: ExtractedChapter[]) =>
    extraction([concept('pointer'), concept('malloc')], [], chapters)

  it('turns valid starts into ranges whose concepts are plan nodes (existing ones reused)', () => {
    const out = withChapters([chapter(0, ['pointer', 'arrays']), chapter(3, ['malloc'])])
    const plan = planGraph(out, [{ id: 'X', canonicalKey: 'arrays', name: 'Arrays' }])
    expect(planChapters(out, plan, IDXS, 4, true)).toEqual({
      errors: [],
      chapters: [
        expect.objectContaining({
          id: 'ch1',
          startIdx: 0,
          endIdx: 2,
          concepts: ['new:pointer', 'X'],
        }),
        expect.objectContaining({ id: 'ch2', startIdx: 3, endIdx: 5, concepts: ['new:malloc'] }),
      ],
    })
  })

  it('drops invalid chapters (with the reasons) instead of failing the map', () => {
    const out = withChapters([chapter(2, ['ghost']), chapter(1)])
    const result = planChapters(out, planGraph(out, []), IDXS, 4, true)
    expect(result.chapters).toBeNull()
    expect(result.errors).toEqual([
      'chapters: the first chapter must start at s0',
      'chapter 1 "From s2": unknown concept "ghost"',
      'chapter 2 "From s1": must start after chapter 1 (s2)',
    ])
  })

  it('reports no_chapters for a timed lecture, also from outputs stored before chapters', () => {
    const empty = withChapters([])
    expect(planChapters(empty, planGraph(empty, []), IDXS, 4, true)).toEqual({
      chapters: null,
      errors: ['no_chapters'],
    })
    // An extractConcepts output saved by prompt 0.2 (mid-pipeline at deploy) has no chapters key.
    const { chapters: _omit, ...old } = empty
    const legacy = old as ExtractConceptsOutput
    expect(planChapters(legacy, planGraph(legacy, []), IDXS, 4, true).chapters).toBeNull()
  })

  it('gives untimed lectures no chapters', () => {
    const out = withChapters([chapter(0)])
    expect(planChapters(out, planGraph(out, []), IDXS, 4, false)).toEqual({
      chapters: null,
      errors: [],
    })
  })
})

describe('validateGraph step', () => {
  let f: PipelineFixture
  beforeEach(async () => {
    f = await createPipelineFixture()
  })

  it('stores nothing and fails without retry on unknown citations', async () => {
    const bad = extraction([concept('pointer', [99])])
    await f.exec(`INSERT INTO pipeline_steps (lecture_id, step, status, output)
      VALUES ('${f.lectureId}', 'extractConcepts', 'done',
        '${JSON.stringify({ extraction: bad, model: 'fake' })}'::jsonb)`)
    await expect(validateGraphStep(f.db, f.lectureId)).rejects.toMatchObject({
      name: 'FatalError',
    })
    expect(await rows(f, `SELECT 1 FROM concepts WHERE canonical_key = 'pointer'`)).toEqual([])
    const [step] = await rows<{ status: string; output: unknown }>(
      f,
      `SELECT status, output FROM pipeline_steps WHERE step = 'validateGraph'`,
    )
    expect(step).toMatchObject({ status: 'failed', output: { error: { code: 'invalid_graph' } } })
  })

  const storeExtraction = (out: ExtractConceptsOutput) =>
    f.exec(`INSERT INTO pipeline_steps (lecture_id, step, status, output)
      VALUES ('${f.lectureId}', 'extractConcepts', 'done',
        '${JSON.stringify({ extraction: out, model: 'fake' })}'::jsonb)`)
  const storedChapters = async () =>
    (
      await rows<{ chapters: unknown }>(
        f,
        `SELECT chapters FROM lectures WHERE id = '${f.lectureId}'`,
      )
    )[0]?.chapters

  it('stores chapters with concept ids, replacing them on a re-run', async () => {
    await storeExtraction(
      extraction(
        [concept('pointer'), concept('malloc', [3])],
        [],
        [chapter(0, ['pointer']), chapter(3, ['malloc', 'pointer'])],
      ),
    )
    await validateGraphStep(f.db, f.lectureId)
    const ids = Object.fromEntries(
      (
        await rows<{ id: string; canonical_key: string }>(
          f,
          `SELECT id, canonical_key FROM concepts`,
        )
      ).map((r) => [r.canonical_key, r.id]),
    )
    expect(await storedChapters()).toEqual([
      {
        id: 'ch1',
        title: 'From s0',
        summary: 'One line.',
        startIdx: 0,
        endIdx: 2,
        conceptIds: [ids.pointer],
      },
      {
        id: 'ch2',
        title: 'From s3',
        summary: 'One line.',
        startIdx: 3,
        endIdx: 11,
        conceptIds: [ids.malloc, ids.pointer],
      },
    ])
  })

  it('keeps the map but stores no chapters when they are invalid', async () => {
    await storeExtraction(extraction([concept('pointer')], [], [chapter(5)]))
    await expect(validateGraphStep(f.db, f.lectureId)).resolves.toMatchObject({
      concepts: 1,
      chapters: 0,
    })
    expect(await storedChapters()).toBeNull()
  })
})
