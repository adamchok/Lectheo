import { describe, expect, it } from 'vitest'
import { formatTimestamp, formatTimestampLong } from './format'

describe('formatTimestamp', () => {
  it.each([
    [0, '0:00'],
    [761_000, '12:41'],
    [761_999, '12:41'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [3_723_000, '1:02:03'],
    [-5, '0:00'],
  ])('%i ms → %s', (ms, expected) => {
    expect(formatTimestamp(ms)).toBe(expected)
  })

  it('has a spoken form', () => {
    expect(formatTimestampLong(761_000)).toBe('12 minutes 41 seconds')
    expect(formatTimestampLong(0)).toBe('0 seconds')
    expect(formatTimestampLong(3_601_000)).toBe('1 hour 1 second')
  })
})
