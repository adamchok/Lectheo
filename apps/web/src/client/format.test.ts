import { describe, expect, it } from 'vitest'
import { formatTimestamp, formatTimestampLong, quotaMessage } from './format'

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

describe('quotaMessage', () => {
  const resetAt = '2026-10-07T00:00:00.000Z'

  it('names the limit in words and the reset time in the given time zone', () => {
    expect(quotaMessage({ metric: 'activities', limit: 30, resetAt }, 'UTC', 'en-GB')).toBe(
      "You've used today's 30 practice activities. The limit resets at 00:00.",
    )
    expect(
      quotaMessage({ metric: 'llm_tasks', limit: 100, resetAt }, 'Asia/Kuala_Lumpur', 'en-GB'),
    ).toBe("You've used today's 100 AI requests. The limit resets at 08:00.")
  })

  it("writes the reset time in the viewer's locale (12-hour in en-US)", () => {
    expect(quotaMessage({ metric: 'activities', limit: 30, resetAt }, 'UTC', 'en-US')).toMatch(
      /resets at 12:00\sAM\.$/,
    )
  })

  it('falls back to plain copy when details are missing or unknown', () => {
    const plain = "You've reached today's limit. Please try again tomorrow."
    expect(quotaMessage(undefined)).toBe(plain)
    expect(quotaMessage({ metric: 'mystery', resetAt: 'not a date' })).toBe(plain)
  })
})
