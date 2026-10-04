import { describe, expect, it } from 'vitest'
import {
  IMPORTANT_WINDOW_AFTER_MS,
  IMPORTANT_WINDOW_BEFORE_MS,
  LOST_WINDOW_AFTER_MS,
  LOST_WINDOW_BEFORE_MS,
  alignMarkers,
  markerWindow,
} from './align-markers'

const SEC = 1000
/** Ten 20-second segments: idx i covers [20i, 20i+20) seconds. */
const SEGMENTS = Array.from({ length: 10 }, (_, idx) => ({
  idx,
  startMs: idx * 20 * SEC,
  endMs: (idx + 1) * 20 * SEC,
}))

describe('markerWindow', () => {
  it('uses the §6.1 window sizes', () => {
    expect([LOST_WINDOW_BEFORE_MS, LOST_WINDOW_AFTER_MS]).toEqual([60 * SEC, 10 * SEC])
    expect([IMPORTANT_WINDOW_BEFORE_MS, IMPORTANT_WINDOW_AFTER_MS]).toEqual([30 * SEC, 15 * SEC])
    expect(markerWindow('lost', 100 * SEC)).toEqual({ startMs: 40 * SEC, endMs: 110 * SEC })
    expect(markerWindow('important', 100 * SEC)).toEqual({ startMs: 70 * SEC, endMs: 115 * SEC })
  })

  it('clamps at zero', () => {
    expect(markerWindow('lost', 5 * SEC).startMs).toBe(0)
  })
})

describe('alignMarkers', () => {
  it('links a lost marker to the concept that covers most of the window before it', () => {
    // Arrange: lost at 100 s → window [40 s, 110 s] covers segs 2,3,4 (fully) and 5 (10 s).
    const occurrences = [
      { conceptId: 'pointers', segmentIdxs: [2, 3] },
      { conceptId: 'malloc', segmentIdxs: [5, 6] },
    ]
    // Act
    const [result] = alignMarkers([{ markerId: 'm1', kind: 'lost', tMs: 100 * SEC }], SEGMENTS, occurrences)
    // Assert
    expect(result).toEqual({ markerId: 'm1', conceptId: 'pointers', overlapScore: 40 / 70 })
  })

  it('uses the asymmetric important window', () => {
    // important at 100 s → [70 s, 115 s]: seg 3 (10 s), seg 4 (20 s), seg 5 (15 s).
    const occurrences = [
      { conceptId: 'early', segmentIdxs: [2] },
      { conceptId: 'later', segmentIdxs: [5] },
    ]
    const [result] = alignMarkers([{ markerId: 'm', kind: 'important', tMs: 100 * SEC }], SEGMENTS, occurrences)
    expect(result?.conceptId).toBe('later')
  })

  it('breaks overlap ties by most occurrence segments in the window', () => {
    // lost at 50 s → [0, 60 s]: segs 0,1,2 each 20 s.
    const segments = [
      { idx: 0, startMs: 0, endMs: 20 * SEC },
      { idx: 1, startMs: 20 * SEC, endMs: 30 * SEC },
      { idx: 2, startMs: 30 * SEC, endMs: 40 * SEC },
      { idx: 3, startMs: 40 * SEC, endMs: 60 * SEC },
    ]
    const occurrences = [
      { conceptId: 'one-segment', segmentIdxs: [0] },
      { conceptId: 'two-segments', segmentIdxs: [1, 2] },
    ]
    const [result] = alignMarkers([{ markerId: 'm', kind: 'lost', tMs: 50 * SEC }], segments, occurrences)
    expect(result?.conceptId).toBe('two-segments')
  })

  it('returns unlinked when no concept occurs in the window (anecdote)', () => {
    const occurrences = [{ conceptId: 'c', segmentIdxs: [9] }]
    const [result] = alignMarkers([{ markerId: 'm', kind: 'lost', tMs: 30 * SEC }], SEGMENTS, occurrences)
    expect(result).toEqual({ markerId: 'm', conceptId: null, overlapScore: 0 })
  })

  it('leaves markers unlinked on untimed transcripts', () => {
    const untimed = [{ idx: 0, startMs: 0, endMs: 0 }]
    const [result] = alignMarkers(
      [{ markerId: 'm', kind: 'lost', tMs: 5 * SEC }],
      untimed,
      [{ conceptId: 'c', segmentIdxs: [0] }],
    )
    expect(result?.conceptId).toBeNull()
  })

  it('merges multiple occurrence rows for the same concept', () => {
    const occurrences = [
      { conceptId: 'a', segmentIdxs: [2] },
      { conceptId: 'b', segmentIdxs: [3] },
      { conceptId: 'a', segmentIdxs: [4] },
    ]
    const [result] = alignMarkers([{ markerId: 'm', kind: 'lost', tMs: 100 * SEC }], SEGMENTS, occurrences)
    expect(result?.conceptId).toBe('a')
  })

  it('returns one result per marker in input order', () => {
    const markers = [
      { markerId: 'x', kind: 'lost' as const, tMs: 10 * SEC },
      { markerId: 'y', kind: 'important' as const, tMs: 190 * SEC },
    ]
    const result = alignMarkers(markers, SEGMENTS, [{ conceptId: 'c', segmentIdxs: [0, 9] }])
    expect(result.map((r) => [r.markerId, r.conceptId])).toEqual([
      ['x', 'c'],
      ['y', 'c'],
    ])
  })
})
