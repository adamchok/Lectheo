import { describe, expect, it } from 'vitest'
import {
  conceptCountForMinutes,
  diagnosticItemCount,
  estimateMinutesFromText,
  scaleForDurationMs,
  scaleForMinutes,
} from './scale'

describe('scale', () => {
  it.each([
    [0, 3],
    [5, 3],
    [10, 3],
    [12, 4],
    [30, 10],
    [45, 15],
    [60, 20],
    [120, 20],
    [Number.NaN, 3],
  ])('%d minutes → %d concepts (F2.2)', (minutes, nodes) => {
    expect(conceptCountForMinutes(minutes)).toBe(nodes)
  })

  it.each([
    [3, 3],
    [4, 3],
    [5, 4],
    [8, 5],
    [10, 6],
    [20, 6],
  ])('%d concepts → %d diagnostic items (F3.1)', (nodes, items) => {
    expect(diagnosticItemCount(nodes)).toBe(items)
  })

  it('combines both counts', () => {
    expect(scaleForMinutes(45)).toEqual({ nodes: 15, diagnosticItems: 6 })
    expect(scaleForDurationMs(9 * 60_000)).toEqual({ nodes: 3, diagnosticItems: 3 })
  })

  it('estimates minutes for untimed text', () => {
    expect(estimateMinutesFromText('word '.repeat(300))).toBe(2)
  })
})
