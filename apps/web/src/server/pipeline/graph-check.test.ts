import type { ExtractConceptsOutput } from '@lectheo/ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateGraphStep } from './graph'
import { graphErrors, planGraph, type CourseEdge } from './graph-check'
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
const dependsOn = (fromKey: string, toKey: string): Edge => ({
  fromKey,
  toKey,
  relation: 'depends_on',
  segmentIdxs: [0],
})

const extraction = (
  concepts: ReturnType<typeof concept>[],
  edges: Edge[] = [],
): ExtractConceptsOutput => ({ concepts, edges })

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
})
