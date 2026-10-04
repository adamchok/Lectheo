import { describe, expect, it } from 'vitest'
import { parseTimingLine } from './cue'
import { parseVtt } from './parse-vtt'

describe('parseTimingLine', () => {
  it('parses hh:mm:ss.mmm with settings', () => {
    expect(parseTimingLine('01:02:03.004 --> 01:02:05.500 align:start position:0%')).toEqual({
      startMs: 3_723_004,
      endMs: 3_725_500,
    })
  })

  it('accepts optional hours and comma milliseconds', () => {
    expect(parseTimingLine('00:05,250 --> 00:07,1')).toEqual({ startMs: 5250, endMs: 7100 })
  })

  it('clamps an end before the start to the start', () => {
    expect(parseTimingLine('00:00:10.000 --> 00:00:05.000')).toEqual({ startMs: 10_000, endMs: 10_000 })
  })

  it('returns null for non-timing lines', () => {
    expect(parseTimingLine('Hello --> world')).toBeNull()
  })
})

describe('parseVtt', () => {
  it('parses a basic file and skips the header', () => {
    // Arrange
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there.\n\n00:00:03.000 --> 00:00:05.000\nGeneral Kenobi.\n'
    // Act
    const cues = parseVtt(vtt)
    // Assert
    expect(cues).toEqual([
      { startMs: 1000, endMs: 3000, text: 'Hello there.' },
      { startMs: 3000, endMs: 5000, text: 'General Kenobi.' },
    ])
  })

  it('handles Teams-style cue ids, voice tags, CRLF and a BOM', () => {
    const vtt =
      '﻿WEBVTT\r\n\r\n3f1c2a/12-0\r\n00:00:01.200 --> 00:00:04.800\r\n<v Jane Doe>Pointers store addresses.</v>\r\n\r\n' +
      '3f1c2a/13-0\r\n00:00:04.800 --> 00:00:06.000\r\n<v Jane Doe>Like this.</v>\r\n'
    expect(parseVtt(vtt)).toEqual([
      { startMs: 1200, endMs: 4800, text: 'Pointers store addresses.' },
      { startMs: 4800, endMs: 6000, text: 'Like this.' },
    ])
  })

  it('skips NOTE, STYLE and REGION blocks', () => {
    const vtt = [
      'WEBVTT - Lecture 4',
      '',
      'NOTE this is a comment',
      'spanning lines',
      '',
      'STYLE',
      '::cue { color: lime }',
      '',
      'REGION',
      'id:fred width:40%',
      '',
      '00:01.000 --> 00:02.000',
      'Only cue',
    ].join('\n')
    expect(parseVtt(vtt)).toEqual([{ startMs: 1000, endMs: 2000, text: 'Only cue' }])
  })

  it('strips inline tags, inline timestamps and decodes entities', () => {
    const vtt =
      'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n<c.yellow>a</c><00:00:01.500><c> &amp; b</c> &lt;3\n'
    expect(parseVtt(vtt)[0]?.text).toBe('a & b <3')
  })

  it('joins multi-line payloads with a space', () => {
    const vtt = 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nfirst line\nsecond line\n'
    expect(parseVtt(vtt)[0]?.text).toBe('first line second line')
  })

  it('splits cues that are not separated by blank lines and drops the id line', () => {
    const vtt = 'WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nOne\n2\n00:00:02.000 --> 00:00:03.000\nTwo\n'
    expect(parseVtt(vtt).map((c) => c.text)).toEqual(['One', 'Two'])
  })

  it('removes rolling-caption repeats and merges identical consecutive cues', () => {
    const vtt = [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:02.000',
      'so a pointer',
      '',
      '00:00:02.000 --> 00:00:03.000',
      'so a pointer',
      'is an address',
      '',
      '00:00:03.000 --> 00:00:04.000',
      'is an address',
    ].join('\n')
    expect(parseVtt(vtt)).toEqual([
      { startMs: 1000, endMs: 2000, text: 'so a pointer' },
      { startMs: 2000, endMs: 4000, text: 'is an address' },
    ])
  })

  it('drops empty cues and sorts by start time', () => {
    const vtt = 'WEBVTT\n\n00:00:05.000 --> 00:00:06.000\nlater\n\n00:00:03.000 --> 00:00:04.000\n<c></c>\n\n00:00:01.000 --> 00:00:02.000\nearlier\n'
    expect(parseVtt(vtt).map((c) => c.text)).toEqual(['earlier', 'later'])
  })

  it('returns an empty list for garbage', () => {
    expect(parseVtt('not a caption file')).toEqual([])
  })
})
