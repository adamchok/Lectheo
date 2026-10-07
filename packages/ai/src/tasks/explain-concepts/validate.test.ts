import { describe, expect, it } from 'vitest'
import { runTask } from '../../run-task'
import { recorder, SEGMENTS } from '../../test-utils'
import type { ExplainedConcept } from './schema'
import { explainConceptsTask, toDepths } from './task'

const KNOWN = new Set([1, 2, 3])
const KEYS = new Set(['pointer', 'malloc'])

const good = (key = 'pointer'): ExplainedConcept => ({
  conceptKey: key,
  howItWorks: [
    { text: 'A pointer holds an address.', cites: [1] },
    { text: 'Dereferencing follows it.', cites: [2, 99] },
  ],
  example: { text: 'Swap two ints.', code: 'int *p = &x;\n', beyondLecture: false },
  mistakes: [
    { mistake: 'A pointer is the value', why: 'It is the address' },
    { mistake: 'NULL is safe to use', why: 'Dereferencing it crashes' },
  ],
})

describe('toDepths (F9.14)', () => {
  it('keeps valid concepts and drops citations outside the lecture', () => {
    const depth = toDepths({ concepts: [good()] }, KEYS, KNOWN).get('pointer')
    expect(depth?.howItWorks.map((p) => p.cites)).toEqual([[1], [2]])
    expect(depth?.example?.code).toBe('int *p = &x;')
  })

  it('drops a concept with a paragraph that cites no real segment', () => {
    const bad = {
      ...good(),
      howItWorks: [...good().howItWorks.slice(0, 1), { text: 'x', cites: [42] }],
    }
    const depths = toDepths({ concepts: [bad, good('malloc')] }, KEYS, KNOWN)
    expect([...depths.keys()]).toEqual(['malloc'])
  })

  it('drops a concept with a URL anywhere, code included', () => {
    const link = { mistake: 'see https://x.io', why: 'y' }
    const inText = { ...good(), mistakes: [...good().mistakes, link] }
    const inCode = {
      ...good('malloc'),
      example: { text: 't', code: '// www.example.com', beyondLecture: true },
    }
    expect(toDepths({ concepts: [inText, inCode] }, KEYS, KNOWN).size).toBe(0)
  })

  it('enforces the counts and ignores unknown keys and repeats', () => {
    const one = { ...good(), howItWorks: good().howItWorks.slice(0, 1) }
    const all = [one, good('nope'), good('malloc'), good('malloc')]
    expect([...toDepths({ concepts: all }, KEYS, KNOWN).keys()]).toEqual(['malloc'])
  })

  it('keeps a null example and leaves out blank code', () => {
    const blank = { ...good(), example: { text: 'Trace it.', code: '  ', beyondLecture: true } }
    const none = { ...good('malloc'), example: null }
    const depths = toDepths({ concepts: [blank, none] }, KEYS, KNOWN)
    expect(depths.get('pointer')?.example).toEqual({ text: 'Trace it.', beyondLecture: true })
    expect(depths.get('malloc')?.example).toBeNull()
  })

  it('the fake passes its own validation', async () => {
    const first = SEGMENTS[0]?.idx ?? 0
    const input = {
      segments: SEGMENTS,
      concepts: [
        { key: 'pointer', name: 'Pointer', summary: 's', keyPoints: ['k'], segmentIdxs: [first] },
      ],
    }
    const { output } = await runTask(explainConceptsTask, input, recorder().ctx({ fake: true }))
    const known = new Set(SEGMENTS.map((s) => s.idx))
    expect(toDepths(output, new Set(['pointer']), known).size).toBe(1)
  })
})
