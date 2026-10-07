import { describe, expect, it } from 'vitest'
import {
  checkVideoCues,
  chunkPlan,
  chunksToRetry,
  formatStamp,
  looksEnglish,
  stampCues,
  stampToMs,
  stitchChunks,
  untrustedShare,
  type VideoChunk,
} from './video-transcript'

const MIN = 60_000
const chunk = (startMin: number, endMin = startMin + 2): VideoChunk => ({
  startMs: startMin * MIN,
  endMs: endMin * MIN,
})
const cue = (startS: number, endS: number, text: string) => ({
  startMs: startS * 1000,
  endMs: endS * 1000,
  text,
})

describe('chunkPlan', () => {
  it('cuts 2-minute chunks and folds a short remainder into the last one', () => {
    expect(chunkPlan(4.5 * MIN)).toEqual([chunk(0), { startMs: 2 * MIN, endMs: 4.5 * MIN }])
    expect(chunkPlan(6.5 * MIN).map((c) => c.endMs / MIN)).toEqual([2, 4, 6.5])
    expect(chunkPlan(7.5 * MIN).map((c) => c.endMs / MIN)).toEqual([2, 4, 6, 7.5])
  })
})

describe('stamps', () => {
  it('reads H:MM:SS, MM:SS and seconds, and formats H:MM:SS', () => {
    expect(stampToMs('1:02:03')).toBe(3_723_000)
    expect(stampToMs('12:30')).toBe(750_000)
    expect(stampToMs('7.5')).toBe(7_500)
    expect(stampToMs('00:10:03,500')).toBe(603_500)
    expect(formatStamp(3_723_999)).toBe('1:02:03')
  })

  it('keeps video-timeline stamps and shifts clip-relative ones', () => {
    const c = chunk(72)
    expect(stampCues([{ start: '1:12:34', end: '1:12:40', text: ' Hi. ' }], c)).toEqual([
      { startMs: 4_354_000, endMs: 4_360_000, text: 'Hi.' },
    ])
    expect(stampCues([{ start: '0:00:04', end: '0:00:10', text: 'Hi.' }], c)[0]?.startMs).toBe(
      4_324_000,
    )
  })

  it('drops empty and unparsable cues', () => {
    const out = stampCues(
      [
        { start: 'x', end: '0:01', text: 'bad' },
        { start: '0:02', end: '0:03', text: '  ' },
        { start: '0:04', end: '0:05', text: 'ok' },
      ],
      chunk(0),
    )
    expect(out.map((c) => c.text)).toEqual(['ok'])
  })
})

describe('stitchChunks (spike boundary cases)', () => {
  it('drops a word repeated across a chunk boundary', () => {
    const out = stitchChunks([
      { chunk: chunk(0), cues: [cue(100, 119, 'we walk down the list, lower')] },
      { chunk: chunk(2), cues: [cue(120, 126, 'lower and lower'), cue(127, 130, 'lower still')] },
    ])
    expect(out.map((c) => c.text)).toEqual([
      'we walk down the list, lower',
      'and lower',
      'lower still',
    ])
  })

  it('re-times an hour/minute slip after the previous cue, keeping its text', () => {
    // "1:00:03" written for "0:10:03" inside the 10–12 minute chunk.
    const out = stitchChunks([
      {
        chunk: chunk(10),
        cues: [cue(600, 602, 'So here we go.'), cue(3603, 3606, 'four words of text')],
      },
    ])
    expect(out[1]).toEqual({
      startMs: 602_000,
      endMs: 602_000 + 4 * 350,
      text: 'four words of text',
    })
  })

  it('caps a re-timed cue at the chunk end', () => {
    const long = Array.from({ length: 50 }, () => 'word').join(' ')
    const out = stitchChunks([
      { chunk: chunk(0), cues: [cue(110, 115, 'a'), cue(9000, 9001, long)] },
    ])
    expect(out[1]?.startMs).toBe(115_000)
    expect(out[1]?.endMs).toBe(120_000)
  })

  it('keeps going after a skipped tail: the next chunk keeps its own times', () => {
    const out = stitchChunks([
      { chunk: chunk(0), cues: [cue(5, 20, 'start'), cue(60, 75, 'then it stops early')] },
      { chunk: chunk(2), cues: [cue(121, 130, 'next chunk')] },
    ])
    expect(out.map((c) => c.startMs / 1000)).toEqual([5, 60, 121])
    expect(chunksToRetry([{ chunk: chunk(0), cues: out.slice(0, 2) }])).toEqual([])
  })

  it('caps a slipped cue end to its chunk (review: 0:19:47 → 1:20:00)', () => {
    const out = stitchChunks([{ chunk: chunk(18, 20), cues: [cue(1187, 4800, 'one two three')] }])
    expect(out[0]).toEqual({ startMs: 1_187_000, endMs: 20 * MIN + 2000, text: 'one two three' })
  })

  it('re-times an end before its start by length', () => {
    const out = stitchChunks([{ chunk: chunk(0), cues: [cue(30, 10, 'one two')] }])
    expect(out[0]).toEqual({ startMs: 30_000, endMs: 30_700, text: 'one two' })
  })

  it('never re-times a cue before the previous one at the chunk end', () => {
    // The previous cue sits past the chunk end (+2 s grace); the slipped cue must follow it.
    const out = stitchChunks([
      { chunk: chunk(0), cues: [cue(121, 125, 'a'), cue(9000, 9001, 'b')] },
    ])
    expect(out[1]?.startMs).toBeGreaterThanOrEqual(out[0]?.startMs ?? 0)
    expect(checkVideoCues(out, 2 * MIN + 5000)).toEqual([])
  })

  it('re-times a cue that starts before the previous one', () => {
    const out = stitchChunks([{ chunk: chunk(0), cues: [cue(50, 60, 'b'), cue(40, 45, 'a')] }])
    expect(out[1]?.startMs).toBe(60_000)
  })
})

describe('chunksToRetry', () => {
  it('flags an empty chunk between chunks with speech, not silence everywhere', () => {
    expect(
      chunksToRetry([
        { chunk: chunk(0), cues: [cue(5, 10, 'x')] },
        { chunk: chunk(2), cues: [] },
        { chunk: chunk(4), cues: [cue(250, 255, 'x')] },
      ]),
    ).toEqual([1])
    expect(
      chunksToRetry([
        { chunk: chunk(0), cues: [] },
        { chunk: chunk(2), cues: [] },
      ]),
    ).toEqual([])
  })

  it('flags a chunk whose cues are mostly untrusted', () => {
    const slipped = [cue(3601, 3602, 'a'), cue(130, 131, 'b'), cue(135, 136, 'c')]
    expect(untrustedShare(slipped, chunk(2))).toBeCloseTo(2 / 3)
    expect(chunksToRetry([{ chunk: chunk(2), cues: slipped }])).toEqual([0])
  })
})

describe('checkVideoCues', () => {
  it('accepts an ordered transcript inside the video', () => {
    expect(checkVideoCues([cue(1, 5, 'a'), cue(6, 9, 'b')], 10_000)).toEqual([])
  })

  it('reports out-of-order cues, cues past the end and large gaps', () => {
    expect(checkVideoCues([cue(10, 12, 'a'), cue(5, 6, 'b')], 60_000)).toHaveLength(1)
    expect(checkVideoCues([cue(70, 71, 'a')], 60_000)).toEqual([
      'cue 0 starts outside the video',
      'cue 0 ends outside the video',
    ])
    expect(checkVideoCues([cue(10, 4800, 'a')], 60_000)).toEqual(['cue 0 ends outside the video'])
    expect(checkVideoCues([cue(0, 5, 'a'), cue(700, 705, 'b')], 900_000)).toEqual([
      'no speech for 12 min at cue 1',
    ])
  })

  it('accepts a long silence covered by chunks that came back empty twice', () => {
    const cues = [cue(0, 5, 'a'), cue(700, 705, 'b')]
    expect(checkVideoCues(cues, 900_000, [chunk(2, 4), chunk(4, 6), chunk(6, 8)])).toEqual([])
  })
})

describe('looksEnglish', () => {
  const english =
    'So today we are going to talk about memory and what it means for a pointer to store ' +
    'the address of a value. If you have a variable in your program, it lives somewhere in ' +
    'memory, and that place has an address that we can print out and then use.'
  const french =
    "Aujourd'hui nous allons parler de la mémoire et de ce que signifie pour un pointeur de " +
    "stocker l'adresse d'une valeur. Si vous avez une variable dans votre programme, elle vit " +
    'quelque part en mémoire, et cet endroit possède une adresse que nous pouvons afficher.'
  it('tells English speech from French', () => {
    expect(looksEnglish(`${english} ${english}`)).toBe(true)
    expect(looksEnglish(`${french} ${french}`)).toBe(false)
  })
  it('does not judge a handful of words', () => {
    expect(looksEnglish('Bonjour à tous')).toBe(true)
  })
})
