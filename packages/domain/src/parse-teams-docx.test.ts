import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { docxParagraphs, parseTeamsDocx } from './parse-teams-docx'

const fixture = (name: string): string =>
  readFileSync(new URL(`./__fixtures__/${name}.document.xml`, import.meta.url), 'utf8')
const doc = (...paragraphs: string[]): string =>
  `<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`

describe('docxParagraphs', () => {
  it('joins runs, keeps tabs, decodes entities and skips paragraph properties', () => {
    const xml =
      '<w:p><w:pPr><w:tabs><w:tab w:val="left"/></w:tabs></w:pPr><w:r><w:t>A &amp; B</w:t></w:r>' +
      '<w:r><w:tab/><w:t xml:space="preserve">0:03 &#8212; &#x2713;</w:t></w:r></w:p><w:p/>'
    expect(docxParagraphs(xml)).toEqual(['A & B\t0:03 — ✓'])
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

  it('parses the "start --> end" layout and drops the speaker paragraph', () => {
    const parsed = parseTeamsDocx(fixture('teams-arrow'))
    expect(parsed?.cues).toEqual([
      { startMs: 0, endMs: 5_270, text: 'Hash tables map keys to buckets.' },
      { startMs: 5_270, endMs: 9_500, text: 'What happens on a collision?' },
      { startMs: 9_500, endMs: 12_000, text: 'We chain entries in a list.' },
    ])
    expect(parsed?.durationMs).toBe(12_000)
  })

  it('never leaves a speaker name in the text', () => {
    const texts = ['teams-speaker-time', 'teams-arrow']
      .flatMap((name) => parseTeamsDocx(fixture(name))?.cues ?? [])
      .map((cue) => cue.text)
      .join(' ')
    expect(texts).not.toMatch(/Jane|Doe|Sam|Lee|Guest/)
  })

  it('strips "Name:" prefixes inside a turn, like the other parsers', () => {
    const parsed = parseTeamsDocx(doc('0:01', 'PROF. MALAN: Pointers hold addresses.'))
    expect(parsed?.cues[0]?.text).toBe('Pointers hold addresses.')
  })

  it('keeps a time that goes backwards as text, not a new turn', () => {
    const parsed = parseTeamsDocx(doc('Jane Doe 12:04', 'We meet at', 'Room 10:30'))
    expect(parsed?.cues).toEqual([
      { startMs: 724_000, endMs: 724_000, text: 'We meet at Room 10:30' },
    ])
  })

  it('returns null for an unknown layout or an empty document', () => {
    expect(parseTeamsDocx(fixture('not-a-transcript'))).toBeNull()
    expect(parseTeamsDocx('<w:document><w:body/></w:document>')).toBeNull()
    expect(parseTeamsDocx('not xml at all')).toBeNull()
  })
})
