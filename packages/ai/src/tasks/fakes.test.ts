import {
  KeyPoints,
  McqAnswerKey,
  McqPublicPayload,
  SpotFlawAnswerKey,
  SpotFlawPublicPayload,
} from '@lectheo/contracts'
import { describe, expect, it } from 'vitest'
import { runTask, type TaskDef } from '../run-task'
import { recorder, SEGMENTS } from '../test-utils'
import { authorReplyTask } from './author-reply/task'
import { draftItemsTask, toItemRecords } from './draft-items/task'
import { extractConceptsTask } from './extract-concepts/task'
import { judgeCorrectionTask } from './judge-correction/task'
import { gradedCriteria } from './common'
import { judgeTeachBackTask } from './judge-teach-back/task'
import { judgeTransferTask } from './judge-transfer/task'
import { leakEscalationTask } from './leak-escalation/task'
import { stumpRefereeTask } from './stump-referee/task'
import { toVerification, verifyItemsTask } from './verify-items/task'

const RUBRIC = {
  criteria: [
    { id: 'c1', label: 'Names the error', description: 'What is wrong', max: 2 },
    { id: 'c2', label: 'Correct fix', description: 'The right behaviour', max: 2 },
  ],
}
const KEY_POINTS = [
  { id: 'k1', text: 'malloc returns heap memory', segmentIdxs: [1] },
  { id: 'k2', text: 'free releases it', segmentIdxs: [2] },
]

async function fakeRun<I, O>(task: TaskDef<I, O>, input: I): Promise<O> {
  const rec = recorder()
  const res = await runTask(task, input, rec.ctx({ fake: true }))
  expect(rec.entries[0]?.outcome).toBe('ok')
  return res.output
}

describe('task fakes are schema-valid and pass their own semantic validation', () => {
  it('extract-concepts', async () => {
    const out = await fakeRun(extractConceptsTask, {
      lectureTitle: 'CS50 Lecture 4: Memory',
      segments: SEGMENTS,
      existingConcepts: [],
      targetCount: 5,
    })
    expect(out.concepts).toHaveLength(5)
    out.concepts.forEach((c) => expect(KeyPoints.safeParse(c.keyPoints).success).toBe(true))
  })

  it('draft-items maps straight to contract-shaped item rows', async () => {
    const out = await fakeRun(draftItemsTask, {
      segments: SEGMENTS,
      concepts: [{ canonicalKey: 'pointer', name: 'Pointer', summary: 's', keyPoints: [] }],
      requests: [{ conceptKey: 'pointer', mcq: 2, spotFlaw: 2, transfer: 1 }],
    })
    const records = toItemRecords(out)
    expect(records).toHaveLength(5)
    const mcq = records.filter((r) => r.kind === 'diagnostic_mcq')
    const flaws = records.filter((r) => r.kind === 'spot_flaw')
    mcq.forEach((r) => {
      expect(McqPublicPayload.parse(r.publicPayload)).toBeTruthy()
      expect(McqAnswerKey.parse(r.answerKey)).toBeTruthy()
    })
    flaws.forEach((r) => {
      expect(SpotFlawPublicPayload.parse(r.publicPayload)).toBeTruthy()
      expect(SpotFlawAnswerKey.parse(r.answerKey)).toBeTruthy()
    })
    expect(flaws.map((r) => (r.answerKey as { hasFlaw: boolean }).hasFlaw)).toEqual([true, false])
  })

  it('verify-items agrees with the fake drafts (fake pipeline yields verified items)', async () => {
    const drafts = await fakeRun(draftItemsTask, {
      segments: SEGMENTS,
      concepts: [{ canonicalKey: 'pointer', name: 'Pointer', summary: 's', keyPoints: [] }],
      requests: [{ conceptKey: 'pointer', mcq: 1, spotFlaw: 2, transfer: 0 }],
    })
    const records = toItemRecords(drafts)
    const items = records.map((r, i) => ({
      ref: `i${i}`,
      kind: r.kind,
      publicPayload: r.publicPayload,
      segmentIdxs: r.segmentIdxs,
    }))
    const out = await fakeRun(verifyItemsTask, { segments: SEGMENTS, items })
    const verdicts = items.map((it, i) =>
      toVerification(it, records[i]!.answerKey, out.results[i]!, 'fake'),
    )
    expect(verdicts.map((v) => v.verdict)).toEqual(['pass', 'pass', 'pass'])
  })

  it('author-reply', async () => {
    const out = await fakeRun(authorReplyTask, {
      conceptName: 'malloc',
      scenarioSentences: ['a', 'b', 'c'],
      history: [],
      studentMessage: 'Why the stack?',
      stricter: false,
    })
    expect(out.reply.length).toBeGreaterThan(0)
  })

  it('judges map to attempt criteria', async () => {
    const correction = await fakeRun(judgeCorrectionTask, {
      scenarioSentences: ['a', 'b', 'c'],
      flawSentenceIdx: 1,
      flawSummary: 'heap not stack',
      correction: 'malloc uses the heap',
      rubric: RUBRIC,
      studentCorrection: 'It should say heap.',
    })
    expect(gradedCriteria(correction, RUBRIC.criteria)).toEqual([
      { id: 'c1', label: 'Names the error', score: 2, max: 2 },
      { id: 'c2', label: 'Correct fix', score: 2, max: 2 },
    ])
    const teach = await fakeRun(judgeTeachBackTask, {
      conceptName: 'malloc',
      keyPoints: KEY_POINTS,
      exchanges: [{ question: 'What is malloc?', answer: 'It gives heap memory.' }],
    })
    expect(teach.criteria.map((c) => c.id)).toEqual(['k1', 'k2'])
    const transfer = await fakeRun(judgeTransferTask, {
      prompt: 'Write swap',
      modelSolution: 'tmp',
      rubric: RUBRIC,
      studentAnswer: 'int t = *a; ...',
    })
    expect(transfer.criteria).toHaveLength(2)
  })

  it('stump-referee (both passes) and leak-escalation', async () => {
    const base = {
      conceptName: 'Pointers',
      segments: SEGMENTS,
      question: 'What does *p evaluate to?',
      answerKey: 'The value at the address in p',
    }
    expect(
      (await fakeRun(stumpRefereeTask, { ...base, mode: 'validate', aiAnswer: null })).aiCorrect,
    ).toBeNull()
    expect(
      (await fakeRun(stumpRefereeTask, { ...base, mode: 'compare', aiAnswer: 'x' })).aiCorrect,
    ).toBe(true)
    const esc = await fakeRun(leakEscalationTask, {
      scenarioSentences: ['a'],
      flawSentenceIdx: 0,
      flawSummary: 's',
      correction: 'c',
      reply: 'r',
    })
    expect(esc.leaks).toBe(false)
  })
})

describe('semantic validators catch bad model output', () => {
  it('draft-items rejects an MCQ whose key is not an option', () => {
    const input = {
      segments: SEGMENTS,
      concepts: [{ canonicalKey: 'pointer', name: 'Pointer', summary: 's', keyPoints: [] }],
      requests: [{ conceptKey: 'pointer', mcq: 1, spotFlaw: 0, transfer: 0 }],
    }
    const good = draftItemsTask.fake(input)
    const bad = {
      ...good,
      mcq: good.mcq.map((m) => ({ ...m, correctOptionId: 'z', segmentIdxs: [99] })),
    }
    const errors = draftItemsTask.validate?.(bad, input) ?? []
    expect(errors.some((e) => e.includes('correctOptionId'))).toBe(true)
    expect(errors.some((e) => e.includes('unknown segment s99'))).toBe(true)
  })

  it('extract-concepts rejects counts outside the scaled range and self-edges', () => {
    const input = { lectureTitle: 'L', segments: SEGMENTS, existingConcepts: [], targetCount: 8 }
    const out = extractConceptsTask.fake({ ...input, targetCount: 3 })
    const selfEdge = {
      ...out,
      edges: [
        { fromKey: 'pointer', toKey: 'pointer', relation: 'depends_on' as const, segmentIdxs: [0] },
      ],
    }
    const errors = extractConceptsTask.validate?.(selfEdge, input) ?? []
    expect(errors.some((e) => e.includes('expected 6..10'))).toBe(true)
    expect(errors.some((e) => e.includes('self-edge'))).toBe(true)
  })
})
