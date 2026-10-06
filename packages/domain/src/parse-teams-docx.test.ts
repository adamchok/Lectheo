import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { docxParagraphs, parseTeamsDocx } from './parse-teams-docx'

const fixture = (name: string): string =>
  readFileSync(new URL(`./__fixtures__/${name}.document.xml`, import.meta.url), 'utf8')
const doc = (...paragraphs: string[]): string =>
  `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`
/** Generous bound: the linear parser takes milliseconds; the old regexes took seconds. */
const FAST_MS = 1000
const elapsedMs = (fn: () => unknown): number => {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('docxParagraphs', () => {
  it('joins runs, keeps tabs, decodes entities and skips paragraph properties', () => {
    const xml =
      '<w:p><w:pPr><w:tabs><w:tab w:val="left"/></w:tabs></w:pPr><w:r><w:t>A &amp; B</w:t></w:r>' +
      '<w:r><w:tab/><w:t xml:space="preserve">0:03 &#8212; &#x2713;</w:t></w:r></w:p><w:p/>'
    expect(docxParagraphs(xml)).toEqual(['A & B\t0:03 — ✓', ''])
  })

  it('keeps a self-closing paragraph separate and breaks lines on <w:br> with attributes', () => {
    const xml =
      '<w:p w:rsidR="1"/><w:p><w:r><w:t>end</w:t><w:br w:type="textWrapping"/><w:t>next</w:t></w:r></w:p>'
    expect(docxParagraphs(xml)).toEqual(['', 'end\nnext'])
  })

  it('drops invalid numeric references and control characters instead of throwing', () => {
    const xml = '<w:p><w:r><w:t>a&#0;b&#99999999;c&#xD800;d&#9;e&#x41;&bogus;</w:t></w:r></w:p>'
    expect(docxParagraphs(xml)).toEqual(['abcd\teA&bogus;'])
  })
})

describe('parseTeamsDocx', () => {
  it('parses the "Speaker Name  0:03" layout, dropping the preamble and notices', () => {
    const parsed = parseTeamsDocx(fixture('teams-speaker-time'))
    expect(parsed).toEqual({
      format: 'docx',
      hasTimestamps: true,
      durationMs: 3_725_000,
      cues: [
        {
          startMs: 3_000,
          endMs: 41_000,
          text: 'Hash tables map keys to buckets & give O(1) lookups.',
        },
        { startMs: 41_000, endMs: 3_725_000, text: 'What happens on a collision?' },
        {
          startMs: 3_725_000,
          endMs: 3_725_000,
          text: 'We chain entries in a list. Open addressing is the other option.',
        },
      ],
    })
  })

  it('parses a real Teams export: avatar, header and speech in one paragraph', () => {
    expect(parseTeamsDocx(fixture('teams-real-export'))).toEqual({
      format: 'docx',
      hasTimestamps: true,
      durationMs: 47_000,
      cues: [
        {
          startMs: 14_000,
          endMs: 31_000,
          text: 'Today we look at hash tables and why lookups are O(1) on average.',
        },
        {
          startMs: 31_000,
          endMs: 47_000,
          text: 'What happens when two keys land in the same bucket?',
        },
        {
          startMs: 47_000,
          endMs: 47_000,
          text: 'That is a collision. We chain the entries in a list.',
        },
      ],
    })
  })

  it('header on the first line: keeps loose-name repeats and the monotonic guard', () => {
    const turn = (...lines: string[]): string => lines.join('</w:t><w:br/><w:t>')
    const loose = doc(
      turn('Jane Doe 0:03', 'Hello.'),
      turn('Sam Lee 0:41', 'Q?', 'More.'),
      turn('Jane Doe 1:02', 'Answer.'),
      turn('Sam Lee 1:30', 'Thanks.'),
    )
    expect(parseTeamsDocx(loose)?.cues.map((c) => [c.startMs, c.text])).toEqual([
      [3_000, 'Hello.'],
      [41_000, 'Q? More.'],
      [62_000, 'Answer.'],
      [90_000, 'Thanks.'],
    ])
    const backwards = doc(
      turn('Jane Doe   1:00', 'Hello.'),
      turn('Sam Lee   0:30', 'Quoted header.'),
    )
    expect(parseTeamsDocx(backwards)?.cues.map((c) => [c.startMs, c.text])).toEqual([
      [60_000, 'Hello. Sam Lee 0:30 Quoted header.'],
    ])
  })

  it('ignores a 24-hour clock in the preamble and a bare time in the text', () => {
    const parsed = parseTeamsDocx(fixture('teams-24h-preamble'))
    expect(parsed?.cues).toEqual([
      { startMs: 3_000, endMs: 20_000, text: 'Today: shortest paths. 10:30' },
      { startMs: 20_000, endMs: 20_000, text: 'Is Dijkstra greedy?' },
    ])
  })

  it('reads a Word-saved file: split runs, proofErr, hyperlink, ins/del, field codes, < and >', () => {
    const parsed = parseTeamsDocx(fixture('teams-word-saved'))
    expect(parsed?.cues).toEqual([
      {
        startMs: 5_000,
        endMs: 70_000,
        text: 'Loop while i < n and j > 0 then stop. See the notes.',
      },
      { startMs: 70_000, endMs: 70_000, text: 'Café — ok!' },
    ])
  })

  it('parses the "start --> end" layout and drops the speaker paragraph', () => {
    const parsed = parseTeamsDocx(fixture('teams-arrow'))
    expect(parsed?.cues).toEqual([
      { startMs: 0, endMs: 5_270, text: 'Hash tables map keys to buckets.' },
      { startMs: 5_270, endMs: 9_500, text: 'What happens on a collision?' },
      { startMs: 9_500, endMs: 12_000, text: 'We chain entries in a list.' },
    ])
    expect(parsed?.durationMs).toBe(12_000)
  })

  it('arrow layout: a block with only the speaker is dropped, not kept as text', () => {
    const parsed = parseTeamsDocx(
      doc('0:0:1.0 --&gt; 0:0:2.0', 'Doe, Jane', 'Hi.', '0:0:2.0 --&gt; 0:0:3.0', 'Doe, Jane'),
    )
    expect(parsed?.cues).toEqual([{ startMs: 1_000, endMs: 2_000, text: 'Hi.' }])
  })

  it('accepts a single space, a line break or no gap between a repeated name and the time', () => {
    const singleSpace = doc(
      'Jane Doe 0:03',
      'Hello there.',
      'Sam Lee 0:41',
      'Question?',
      'Jane Doe 1:02',
      'Answer.',
      'Sam Lee 1:30',
      'Thanks.',
    )
    expect(parseTeamsDocx(singleSpace)?.cues.map((c) => [c.startMs, c.text])).toEqual([
      [3_000, 'Hello there.'],
      [41_000, 'Question?'],
      [62_000, 'Answer.'],
      [90_000, 'Thanks.'],
    ])
    const brAndRuns =
      '<w:p><w:r><w:t>Jane Doe</w:t><w:br/><w:t>0:03</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Hello.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Jane Doe</w:t></w:r><w:r><w:t>0:41</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Bye.</w:t></w:r></w:p>'
    expect(parseTeamsDocx(brAndRuns)?.cues.map((c) => [c.startMs, c.text])).toEqual([
      [3_000, 'Hello.'],
      [41_000, 'Bye.'],
    ])
  })

  it('strict headers: a sentence ending in a later time stays text', () => {
    const parsed = parseTeamsDocx(
      doc(
        'Jane Doe   0:03',
        'Hello.',
        'Office hours are at 10:30',
        'Sam Lee   0:41',
        'Q?',
        'Jane Doe   1:02',
        'Answer.',
      ),
    )
    expect(parsed?.cues.map((c) => [c.startMs, c.text])).toEqual([
      [3_000, 'Hello. Office hours are at 10:30'],
      [41_000, 'Q?'],
      [62_000, 'Answer.'],
    ])
  })

  it('loose headers: only repeated names start turns, so a one-off sentence stays text', () => {
    const parsed = parseTeamsDocx(
      doc(
        'Jane Doe 0:03',
        'Hello.',
        'Office hours are at 10:30',
        'Sam Lee 0:41',
        'Q?',
        'Jane Doe 1:02',
        'Answer.',
        'Sam Lee 1:30',
        'Thanks.',
      ),
    )
    expect(parsed?.cues.map((c) => [c.startMs, c.text])).toEqual([
      [3_000, 'Hello. Office hours are at 10:30'],
      [41_000, 'Q?'],
      [62_000, 'Answer.'],
      [90_000, 'Thanks.'],
    ])
  })

  it('a single space with a digit or comma in the name is not a header (preamble dates)', () => {
    expect(parseTeamsDocx(doc('6 October 2026, 14:00', 'Agenda'))).toBeNull()
    expect(parseTeamsDocx(doc('Room 101 10:30', 'Agenda'))).toBeNull()
  })

  it('arrow layout: a repeated sentence opening two blocks is speech, not a speaker', () => {
    const parsed = parseTeamsDocx(
      doc(
        '0:0:1.0 --&gt; 0:0:2.0',
        'Okay.',
        'Let us start.',
        '0:0:2.0 --&gt; 0:0:3.0',
        'Okay.',
        'Next.',
      ),
    )
    expect(parsed?.cues.map((c) => c.text)).toEqual(['Okay. Let us start.', 'Okay. Next.'])
  })

  it('arrow layout without speaker lines keeps every line', () => {
    const parsed = parseTeamsDocx(
      doc(
        '0:0:1.0 --&gt; 0:0:2.0',
        'We chain entries',
        'in a list.',
        '0:0:2.0 --&gt; 0:0:3.0',
        'Done.',
      ),
    )
    expect(parsed?.cues.map((c) => c.text)).toEqual(['We chain entries in a list.', 'Done.'])
  })

  it('never leaves a speaker name in the text', () => {
    const texts = ['teams-speaker-time', 'teams-arrow', 'teams-24h-preamble', 'teams-word-saved']
      .flatMap((name) => parseTeamsDocx(fixture(name))?.cues ?? [])
      .map((cue) => cue.text)
      .join(' ')
    expect(texts).not.toMatch(/Jane|Doe|Sam|Lee|Guest/)
  })

  it('strips "Name:" prefixes inside a turn, like the other parsers', () => {
    const parsed = parseTeamsDocx(doc('Jane Doe  0:01', 'PROF. MALAN: Pointers hold addresses.'))
    expect(parsed?.cues[0]?.text).toBe('Pointers hold addresses.')
  })

  it('keeps a header-looking line whose time goes backwards as text', () => {
    const parsed = parseTeamsDocx(doc('Jane Doe  12:04', 'Earlier, as', 'Sam Lee  10:30', 'said.'))
    expect(parsed?.cues).toEqual([
      { startMs: 724_000, endMs: 724_000, text: 'Earlier, as Sam Lee 10:30 said.' },
    ])
  })

  it('returns null for an unknown layout or an empty document', () => {
    expect(parseTeamsDocx(fixture('not-a-transcript'))).toBeNull()
    expect(parseTeamsDocx('<w:document><w:body/></w:document>')).toBeNull()
    expect(parseTeamsDocx('not xml at all')).toBeNull()
  })

  it('stays linear on pathological XML (unclosed tags, unclosed runs, long space runs)', () => {
    const inputs = [
      '<w:p>'.repeat(100_000),
      `<w:p>${'<w:t '.repeat(100_000)}`,
      doc('&lt;v '.repeat(50_000)),
      doc(`Jane${' '.repeat(200_000)}x`),
      doc('Jane Doe  0:01', '&lt;'.repeat(100_000)),
    ]
    for (const xml of inputs) expect(elapsedMs(() => parseTeamsDocx(xml))).toBeLessThan(FAST_MS)
  })
})
