import { describe, expect, it } from 'vitest'
import { parseSrt } from './parse-srt'

describe('parseSrt', () => {
  it('parses indexed cues with comma milliseconds', () => {
    // Arrange
    const srt = '1\n00:00:01,000 --> 00:00:04,000\nHello world.\n\n2\n00:00:04,500 --> 00:00:06,250\nSecond cue.\n'
    // Act
    const cues = parseSrt(srt)
    // Assert
    expect(cues).toEqual([
      { startMs: 1000, endMs: 4000, text: 'Hello world.' },
      { startMs: 4500, endMs: 6250, text: 'Second cue.' },
    ])
  })

  it('strips formatting tags, ASS overrides and coordinates', () => {
    const srt = '1\r\n00:00:01,000 --> 00:00:02,000 X1:100 X2:200 Y1:10 Y2:20\r\n{\\an8}<i>Big</i> <font color="#fff">O</font>\r\n'
    expect(parseSrt(srt)).toEqual([{ startMs: 1000, endMs: 2000, text: 'Big O' }])
  })

  it('joins multi-line text', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nline one\nline two\n'
    expect(parseSrt(srt)[0]?.text).toBe('line one line two')
  })

  it('handles missing blank lines between cues', () => {
    const srt = '1\n00:00:01,000 --> 00:00:02,000\nOne\n2\n00:00:02,000 --> 00:00:03,000\nTwo\n'
    expect(parseSrt(srt).map((c) => c.text)).toEqual(['One', 'Two'])
  })

  it('tolerates dot milliseconds and extra blank lines', () => {
    const srt = '\n\n1\n00:00:01.500 --> 00:00:02.000\nDot\n\n\n\n'
    expect(parseSrt(srt)).toEqual([{ startMs: 1500, endMs: 2000, text: 'Dot' }])
  })
})
