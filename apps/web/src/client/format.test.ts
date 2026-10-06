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
    // The time is in the viewer's locale (12- or 24-hour), so build the expectation the same way.
    const at = (timeZone: string) =>
      new Date(resetAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      })
    expect(quotaMessage({ metric: 'activities', limit: 30, resetAt }, 'UTC')).toBe(
      `You've used today's 30 practice activities. The limit resets at ${at('UTC')}.`,
    )
    expect(quotaMessage({ metric: 'llm_tasks', limit: 100, resetAt }, 'Asia/Kuala_Lumpur')).toBe(
      `You've used today's 100 AI requests. The limit resets at ${at('Asia/Kuala_Lumpur')}.`,
    )
    expect(at('Asia/Kuala_Lumpur')).toMatch(/08:00|8:00/)
  })

  it('falls back to plain copy when details are missing or unknown', () => {
    const plain = "You've reached today's limit. Please try again tomorrow."
    expect(quotaMessage(undefined)).toBe(plain)
    expect(quotaMessage({ metric: 'mystery', resetAt: 'not a date' })).toBe(plain)
  })
})
