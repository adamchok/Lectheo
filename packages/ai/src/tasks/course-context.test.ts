import { describe, expect, it } from 'vitest'
import type { PromptSpec } from '../run-task'
import * as authorReply from './author-reply/prompt'
import * as draftItems from './draft-items/prompt'
import * as explainConcepts from './explain-concepts/prompt'
import * as extractConcepts from './extract-concepts/prompt'
import * as friendReply from './friend-reply/prompt'
import * as judgeCorrection from './judge-correction/prompt'
import * as judgeTeachBack from './judge-teach-back/prompt'
import * as judgeTransfer from './judge-transfer/prompt'
import * as leakEscalation from './leak-escalation/prompt'
import * as stumpAnswer from './stump-answer/prompt'
import * as stumpReferee from './stump-referee/prompt'
import * as verifyItems from './verify-items/prompt'

/* Subject-neutral prompts (Product Spec decision log, 8 Oct 2026): the course is named only
 * through the untrusted <course_title> block, never hard-coded in a system prompt. */

const titles = { courseTitle: 'Econ 101', lectureTitle: 'Lecture 3: Elasticity' }
const RUBRIC = { criteria: [{ id: 'c', label: 'Fix', description: 'States the fix.', max: 2 }] }
const SEGMENTS = [{ idx: 0, text: 'Demand falls when price rises.' }]

const TASKS: readonly { name: string; system: string; build: () => PromptSpec }[] = [
  {
    name: 'author-reply',
    system: authorReply.SYSTEM,
    build: () =>
      authorReply.buildPrompt({
        ...titles,
        conceptName: 'elasticity',
        scenarioSentences: ['A.', 'B.'],
        history: [],
        studentMessage: 'Why?',
        stricter: false,
      }),
  },
  {
    name: 'friend-reply',
    system: friendReply.SYSTEM,
    build: () =>
      friendReply.buildPrompt({
        ...titles,
        conceptName: 'elasticity',
        history: [{ role: 'student', text: 'It measures response.' }],
        turn: 1,
        maxTurns: 6,
      }),
  },
  {
    name: 'judge-correction',
    system: judgeCorrection.SYSTEM,
    build: () =>
      judgeCorrection.buildPrompt({
        ...titles,
        scenarioSentences: ['A.', 'B.'],
        flawSentenceIdx: 1,
        flawSummary: 'B is false',
        correction: 'Not B.',
        rubric: RUBRIC,
        studentCorrection: 'Not B.',
      }),
  },
  {
    name: 'judge-teach-back',
    system: judgeTeachBack.SYSTEM,
    build: () =>
      judgeTeachBack.buildPrompt({
        ...titles,
        conceptName: 'elasticity',
        keyPoints: [{ id: 'k1', text: 'It is a ratio.', segmentIdxs: [0] }],
        exchanges: [{ question: 'What is it?', answer: 'A ratio.' }],
      }),
  },
  {
    name: 'judge-transfer',
    system: judgeTransfer.SYSTEM,
    build: () =>
      judgeTransfer.buildPrompt({
        ...titles,
        prompt: 'Price rises 10%…',
        modelSolution: 'Elastic.',
        rubric: RUBRIC,
        studentAnswer: 'Elastic.',
      }),
  },
  {
    name: 'stump-answer',
    system: stumpAnswer.SYSTEM,
    build: () =>
      stumpAnswer.buildPrompt({
        ...titles,
        conceptName: 'elasticity',
        segments: SEGMENTS,
        question: 'Q?',
      }),
  },
  {
    name: 'stump-referee',
    system: stumpReferee.SYSTEM,
    build: () =>
      stumpReferee.buildPrompt({
        ...titles,
        mode: 'validate',
        conceptName: 'elasticity',
        segments: SEGMENTS,
        question: 'Q?',
        answerKey: 'K',
        aiAnswer: null,
      }),
  },
]

describe('course-aware prompts', () => {
  it.each(TASKS)('$name names the course and lecture in untrusted blocks', ({ system, build }) => {
    const spec = build()
    const text = `${String(spec.system ?? '')}\n${String(spec.prompt ?? '')}`
    expect(text).toContain('Course: <course_title>\nEcon 101\n</course_title>')
    expect(text).toContain('Lecture: <lecture_title>\nLecture 3: Elasticity\n</lecture_title>')
    // The static system prompt refers to the tag but never carries the title itself.
    expect(system).toContain('<course_title>')
    expect(system).not.toContain('Econ 101')
    expect(String(spec.system ?? '').startsWith(system)).toBe(true)
  })
})

describe('no system prompt assumes computer science', () => {
  const SYSTEMS = {
    ...Object.fromEntries(TASKS.map((t) => [t.name, t.system])),
    'extract-concepts': extractConcepts.SYSTEM,
    'explain-concepts': explainConcepts.SYSTEM,
    'draft-items': draftItems.SYSTEM,
    'verify-items': verifyItems.SYSTEM,
    'leak-escalation': leakEscalation.SYSTEM,
  }
  it.each(Object.entries(SYSTEMS))('%s', (_name, system) => {
    expect(system).not.toMatch(/computer.science|\bCS(50)?\b/i)
  })
})
