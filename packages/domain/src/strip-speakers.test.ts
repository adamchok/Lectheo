import { describe, expect, it } from 'vitest'
import { findRepeatedLabels, stripSpeakers, stripSpeakersFromCues } from './strip-speakers'

describe('stripSpeakers', () => {
  it.each([
    ['<v Jane Doe>Hello</v>', 'Hello'],
    ['<v.loud Bob>Hi there', 'Hi there'],
    ['David Malan: so today we talk about memory', 'so today we talk about memory'],
    ['DAVID J. MALAN: All right.', 'All right.'],
    ['[Professor] Welcome back.', 'Welcome back.'],
    ['[Jane Doe]: Welcome back.', 'Welcome back.'],
    ['Speaker 1: Hello', 'Hello'],
    ['SPEAKER_01: Hello', 'Hello'],
    ['>> AUDIENCE: Yes.', 'Yes.'],
    ['>> Is it zero?', 'Is it zero?'],
    ['[MUSIC PLAYING]', ''],
  ])('strips the speaker from %j', (input, expected) => {
    expect(stripSpeakers(input)).toBe(expected)
  })

  it.each([
    'Note: this is important',
    'Example: a linked list',
    'Recursion: a function that calls itself',
    'The ratio is 3:1 here',
    'We saw this earlier, Alice: remember?',
    '- 5 is negative here',
  ])('keeps content %j', (input) => {
    expect(stripSpeakers(input)).toBe(input)
  })

  it('strips a single mixed-case word only when it is a known speaker', () => {
    expect(stripSpeakers('Alice: hi', new Set(['Alice']))).toBe('hi')
    expect(stripSpeakers('Alice: hi')).toBe('Alice: hi')
  })

  it('strips labels at the start of each line of a multi-line cue', () => {
    expect(stripSpeakers('Jane Doe: first\nJohn Roe: second')).toBe('first second')
  })
})

describe('findRepeatedLabels', () => {
  it('finds labels that start at least two lines', () => {
    const labels = findRepeatedLabels(['Alice: one', 'Bob: two', 'Alice: three', 'Recursion: x'])
    expect([...labels]).toEqual(['Alice'])
  })
})

describe('stripSpeakersFromCues', () => {
  it('learns repeated single-word speakers and drops cues that become empty', () => {
    // Arrange
    const cues = [
      { startMs: 0, endMs: 1, text: 'Alice: pointers hold addresses' },
      { startMs: 1, endMs: 2, text: '[LAUGHTER]' },
      { startMs: 2, endMs: 3, text: 'Alice: right' },
      { startMs: 3, endMs: 4, text: 'Recursion: calls itself' },
    ]
    // Act
    const result = stripSpeakersFromCues(cues)
    // Assert
    expect(result.map((c) => c.text)).toEqual(['pointers hold addresses', 'right', 'Recursion: calls itself'])
    expect(cues[0]?.text).toBe('Alice: pointers hold addresses')
  })
})
