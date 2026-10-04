import { describe, expect, it } from 'vitest'
import { MAX_PLAIN_CHUNK_CHARS, detectTranscriptFormat, parseTranscript } from './parse-transcript'

const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\n<v Jane>Arrays are contiguous.</v>\n\n00:00:04.000 --> 00:01:30.000\nJane Doe: Pointers store addresses.\n'
const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello\n'

describe('detectTranscriptFormat', () => {
  it.each([
    [VTT, 'vtt'],
    ['  \n' + VTT, 'vtt'],
    [SRT, 'srt'],
    ['00:00:01.000 --> 00:00:02.000\nheaderless vtt', 'vtt'],
    ['Just some lecture notes.\n\nAnother paragraph.', 'text'],
    ['', 'text'],
  ])('detects %#', (input, expected) => {
    expect(detectTranscriptFormat(input)).toBe(expected)
  })
})

describe('parseTranscript', () => {
  it('parses VTT, strips speakers and reports duration', () => {
    const result = parseTranscript(VTT)
    expect(result).toEqual({
      format: 'vtt',
      hasTimestamps: true,
      durationMs: 90_000,
      cues: [
        { startMs: 1000, endMs: 4000, text: 'Arrays are contiguous.' },
        { startMs: 4000, endMs: 90_000, text: 'Pointers store addresses.' },
      ],
    })
  })

  it('parses SRT', () => {
    expect(parseTranscript(SRT)).toMatchObject({ format: 'srt', hasTimestamps: true, durationMs: 2000 })
  })

  it('treats plain text as untimed paragraphs (F1.7)', () => {
    // Arrange
    const text = 'Professor Smith: Arrays are contiguous.\nThey live in memory.\n\nProfessor Smith: Pointers store addresses.'
    // Act
    const result = parseTranscript(text)
    // Assert
    expect(result.hasTimestamps).toBe(false)
    expect(result.durationMs).toBeNull()
    expect(result.cues).toEqual([
      { startMs: 0, endMs: 0, text: 'Arrays are contiguous. They live in memory.' },
      { startMs: 0, endMs: 0, text: 'Pointers store addresses.' },
    ])
  })

  it('cuts very long paragraphs into sentence chunks', () => {
    const sentence = 'This sentence is about memory layout in C programs. '
    const text = sentence.repeat(40)
    const result = parseTranscript(text)
    expect(result.cues.length).toBeGreaterThan(1)
    for (const cue of result.cues) expect(cue.text.length).toBeLessThanOrEqual(MAX_PLAIN_CHUNK_CHARS)
  })

  it('returns no cues for an empty file', () => {
    expect(parseTranscript('   ').cues).toEqual([])
  })
})
