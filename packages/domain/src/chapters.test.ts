import { describe, expect, it } from 'vitest'
import { chapterCountRange, chapterErrors, chapterTimes, toChapterRanges } from './chapters'

const segs = Array.from({ length: 10 }, (_, i) => i + 5) // s5..s14
const start = (startIdx: number, concepts: string[] = []) => ({
  title: `At ${startIdx}`,
  summary: 'One line.',
  startIdx,
  concepts,
})
const known = (c: string) => c !== 'ghost'

describe('chapterCountRange (F11.1)', () => {
  it('allows roughly 8–15 per hour', () => {
    expect(chapterCountRange(60)).toEqual({ min: 7, max: 16 })
    expect(chapterCountRange(45)).toEqual({ min: 5, max: 13 })
    expect(chapterCountRange(5)).toEqual({ min: 1, max: 3 })
  })
})

describe('chapterErrors (F11.2)', () => {
  it('accepts ordered starts from the first segment', () => {
    expect(chapterErrors([start(5, ['a']), start(9), start(12)], segs, 20, known)).toEqual([])
  })

  it('rejects a late first chapter, overlaps, unknown segments and concepts', () => {
    const errors = chapterErrors(
      [start(6), start(9, ['ghost']), start(9), start(99)],
      segs,
      30,
      known,
    )
    expect(errors).toEqual([
      'chapters: the first chapter must start at s5',
      'chapter 2 "At 9": unknown concept "ghost"',
      'chapter 3 "At 9": must start after chapter 2 (s9)',
      'chapter 4 "At 99": unknown segment s99',
    ])
  })

  it('rejects over-long titles and summaries', () => {
    const long = { ...start(5), title: 'x'.repeat(81), summary: 'y'.repeat(301) }
    expect(chapterErrors([long], segs, 5, known)).toEqual([
      'chapter 1 "' + 'x'.repeat(81) + '": title longer than 80 characters',
      'chapter 1 "' + 'x'.repeat(81) + '": summary longer than 300 characters',
    ])
  })

  it('rejects counts far from 8–15 per hour, and none at all', () => {
    expect(chapterErrors([start(5)], segs, 60, known)).toEqual([
      'chapters: expected 7..16 for 60 min, got 1',
    ])
    expect(chapterErrors([], segs, 60, known)).toEqual(['chapters: none given'])
  })
})

describe('toChapterRanges and chapterTimes', () => {
  it('ends each chapter before the next, the last at the last segment', () => {
    const ranges = toChapterRanges([start(5, ['a', 'a']), start(9)], 14)
    expect(
      ranges.map(({ id, startIdx, endIdx, concepts }) => ({ id, startIdx, endIdx, concepts })),
    ).toEqual([
      { id: 'ch1', startIdx: 5, endIdx: 8, concepts: ['a'] },
      { id: 'ch2', startIdx: 9, endIdx: 14, concepts: [] },
    ])
  })

  it('reads times from the segments', () => {
    const byIdx = new Map(
      segs.map((idx) => [idx, { idx, startMs: idx * 1000, endMs: idx * 1000 + 900 }]),
    )
    expect(chapterTimes({ startIdx: 5, endIdx: 8 }, byIdx)).toEqual({ startMs: 5000, endMs: 8900 })
    expect(chapterTimes({ startIdx: 5, endIdx: 99 }, byIdx)).toBeNull()
  })
})
