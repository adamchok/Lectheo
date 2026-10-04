import { describe, expect, it } from 'vitest'
import { MAX_SEGMENT_MS, segmentCues } from './segment'
import { endsSentence, splitSentences } from './sentences'

const SEC = 1000

describe('sentences', () => {
  it('splits on terminal punctuation followed by a capital', () => {
    expect(splitSentences('Hi there. How are you? Fine! ok')).toEqual(['Hi there.', 'How are you?', 'Fine! ok'])
  })

  it('does not split on abbreviations or lowercase continuations', () => {
    expect(splitSentences('Use e.g. Arrays here. Then stop.')).toEqual(['Use e.g. Arrays here.', 'Then stop.'])
    expect(endsSentence('see Dr.')).toBe(false)
    expect(endsSentence('done."')).toBe(true)
  })
})

describe('segmentCues', () => {
  it('merges cue fragments into one sentence group with stable indexes', () => {
    // Arrange
    const cues = [
      { startMs: 0, endMs: 3 * SEC, text: 'A pointer is' },
      { startMs: 3 * SEC, endMs: 6 * SEC, text: 'an address.' },
      { startMs: 6 * SEC, endMs: 9 * SEC, text: 'Arrays are contiguous.' },
    ]
    // Act
    const segments = segmentCues(cues)
    // Assert
    expect(segments).toEqual([
      { idx: 0, startMs: 0, endMs: 9 * SEC, text: 'A pointer is an address. Arrays are contiguous.' },
    ])
  })

  it('never exceeds 40 s and prefers sentence boundaries', () => {
    const cues = Array.from({ length: 30 }, (_, i) => ({
      startMs: i * 5 * SEC,
      endMs: (i + 1) * 5 * SEC,
      text: i % 3 === 2 ? `end ${i}.` : `Part ${i}`,
    }))
    const segments = segmentCues(cues)
    expect(segments.map((s) => s.idx)).toEqual(segments.map((_, i) => i))
    for (const s of segments) {
      expect(s.endMs - s.startMs).toBeLessThanOrEqual(MAX_SEGMENT_MS)
    }
    // All but the last segment end on a sentence boundary.
    for (const s of segments.slice(0, -1)) expect(s.text.endsWith('.')).toBe(true)
    expect(segments.map((s) => s.text).join(' ')).toBe(cues.map((c) => c.text).join(' '))
  })

  it('cuts a run-on sentence at cue boundaries', () => {
    const cues = Array.from({ length: 20 }, (_, i) => ({
      startMs: i * 5 * SEC,
      endMs: (i + 1) * 5 * SEC,
      text: `word${i}`,
    }))
    const segments = segmentCues(cues)
    expect(segments.length).toBeGreaterThan(1)
    for (const s of segments) expect(s.endMs - s.startMs).toBeLessThanOrEqual(MAX_SEGMENT_MS)
  })

  it('keeps a single cue longer than 40 s as its own segment', () => {
    const cues = [
      { startMs: 0, endMs: 5 * SEC, text: 'Short.' },
      { startMs: 5 * SEC, endMs: 65 * SEC, text: 'Very long cue.' },
      { startMs: 65 * SEC, endMs: 70 * SEC, text: 'After.' },
    ]
    const segments = segmentCues(cues)
    expect(segments.map((s) => s.text)).toEqual(['Short.', 'Very long cue.', 'After.'])
  })

  it('interpolates times for several sentences inside one cue', () => {
    const cues = [{ startMs: 0, endMs: 80 * SEC, text: 'First sentence here. Second sentence here.' }]
    const segments = segmentCues(cues)
    expect(segments).toHaveLength(2)
    expect(segments[0]?.endMs).toBe(segments[1]?.startMs)
  })

  it('groups untimed text into 3–5 sentence segments with zero times', () => {
    // Arrange
    const paragraph = Array.from({ length: 9 }, (_, i) => `Sentence ${i}.`).join(' ')
    const cues = [{ startMs: 0, endMs: 0, text: paragraph }]
    // Act
    const segments = segmentCues(cues)
    // Assert
    expect(segments.map((s) => s.text.split('. ').length)).toEqual([4, 5])
    expect(segments.every((s) => s.startMs === 0 && s.endMs === 0)).toBe(true)
  })

  it('closes untimed groups at paragraph breaks once they have 3 sentences', () => {
    const cues = [
      { startMs: 0, endMs: 0, text: 'A one. A two. A three.' },
      { startMs: 0, endMs: 0, text: 'B one. B two. B three.' },
    ]
    expect(segmentCues(cues).map((s) => s.text)).toEqual(['A one. A two. A three.', 'B one. B two. B three.'])
  })

  it('returns no segments for no cues', () => {
    expect(segmentCues([])).toEqual([])
  })
})
