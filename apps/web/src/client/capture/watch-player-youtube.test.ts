import { describe, expect, it } from 'vitest'
import { firstPlayCheck, type FirstPlay } from './watch-player-youtube'

// A 6:05 video (the F10 repro, youtu.be/BTjxUS_PylA) opened at 1:42.
const base: FirstPlay = {
  startMs: 102_000,
  endMs: null,
  currentMs: 102_000,
  durationMs: 365_000,
  reseeked: false,
}

describe('firstPlayCheck', () => {
  it('accepts playback at the requested start', () => {
    expect(firstPlayCheck(base)).toBe('ok')
    expect(firstPlayCheck({ ...base, currentMs: 100_500 })).toBe('ok')
  })

  it('re-seeks once when the embed ignored the start and plays from 0:00', () => {
    expect(firstPlayCheck({ ...base, currentMs: 0 })).toBe('reseek')
  })

  it('re-seeks even when the duration is still unknown', () => {
    expect(firstPlayCheck({ ...base, currentMs: 0, durationMs: 0 })).toBe('reseek')
  })

  it('gives up when the re-seek did not move playback', () => {
    expect(firstPlayCheck({ ...base, currentMs: 0, reseeked: true })).toBe('blocked')
  })

  it('accepts a re-seek that landed within the slack', () => {
    expect(firstPlayCheck({ ...base, currentMs: 95_000, reseeked: true })).toBe('ok')
  })

  it('blocks a video shorter than the lecture window', () => {
    expect(firstPlayCheck({ ...base, startMs: 600_000, currentMs: 0 })).toBe('blocked')
    expect(firstPlayCheck({ ...base, startMs: 0, endMs: 900_000, currentMs: 0 })).toBe('blocked')
  })

  it('never re-seeks from the start of the video', () => {
    expect(firstPlayCheck({ ...base, startMs: 0, currentMs: 0 })).toBe('ok')
  })
})
