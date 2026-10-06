import { type Cue, collapseWhitespace, finalizeCues, parseTimingLine, stripCueMarkup } from './cue'
import type { ParsedTranscript } from './parse-transcript'
import { stripSpeakersFromCues } from './strip-speakers'

/*
 * Teams .docx transcripts (F1.5). Pure: takes `word/document.xml` (the caller unzips the file)
 * and returns null when the layout isn't one we know, so the caller can refuse it.
 *
 * Layouts seen in the wild:
 *  - "header": current Teams. Title / date / "X started transcription" preamble, then per turn
 *    a `Speaker Name   0:03` paragraph (time is m:ss or h:mm:ss) followed by text paragraphs.
 *  - "arrow": older Teams / Stream. `00:00:03.000 --> 00:00:07.000` paragraph, then a speaker
 *    paragraph, then text (VTT-like, one line per paragraph).
 */

/** `Speaker Name   0:03` or `1:02:03`; the name is optional (some exports omit it). */
const HEADER = /^(?:(.{1,80}?)\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/
/** Teams notices such as "Jane Doe started transcription": not speech. */
const NOTICE = /\s(?:started|stopped) transcription$/
const PARAGRAPH = /<w:p[\s>][\s\S]*?<\/w:p>/g
const RUN_TOKEN = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(?:tab|br|cr)\s*\/>/g
const XML_ENTITY = /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}

/** Plain text of each `<w:p>` in a WordprocessingML body, in order. */
export function docxParagraphs(documentXml: string): string[] {
  return (documentXml.match(PARAGRAPH) ?? []).map((p) => {
    let text = ''
    for (const [token, value] of p.matchAll(RUN_TOKEN)) {
      text += value ?? (token.startsWith('<w:tab') ? '\t' : '\n')
    }
    return decodeXml(text).trim()
  })
}

/** Parses a Teams transcript's `word/document.xml`. Null when the layout is unknown. */
export function parseTeamsDocx(documentXml: string): ParsedTranscript | null {
  const paragraphs = docxParagraphs(documentXml).filter((p) => p.length > 0 && !NOTICE.test(p))
  const raw = paragraphs.some((p) => parseTimingLine(p) !== null)
    ? parseArrowLayout(paragraphs)
    : parseHeaderLayout(paragraphs)
  const cues = stripSpeakersFromCues(finalizeCues(raw))
  if (cues.length === 0) return null
  const durationMs = cues.reduce((max, cue) => Math.max(max, cue.endMs), 0)
  return { format: 'docx', cues, hasTimestamps: true, durationMs }
}

function parseArrowLayout(paragraphs: readonly string[]): Cue[] {
  const blocks: { startMs: number; endMs: number; lines: string[] }[] = []
  for (const p of paragraphs) {
    const timing = parseTimingLine(p)
    if (timing) blocks.push({ ...timing, lines: [] })
    else blocks.at(-1)?.lines.push(p)
  }
  // The paragraph after the timing line is the speaker when text follows it.
  return blocks.map(({ startMs, endMs, lines }) => ({
    startMs,
    endMs,
    text: toText(lines.length > 1 ? lines.slice(1) : lines),
  }))
}

function parseHeaderLayout(paragraphs: readonly string[]): Cue[] {
  const turns: { startMs: number; lines: string[] }[] = []
  for (const p of paragraphs) {
    const startMs = headerStartMs(p)
    const previous = turns.at(-1)
    // Turns never go back in time, so "We meet at 10:30" after 12:04 stays text.
    // ponytail: a text paragraph ending in a later time ("Back at 12:30") still reads as a
    // header; check speaker names against the doc's repeat speakers if that shows up.
    if (startMs !== null && startMs >= (previous?.startMs ?? 0)) turns.push({ startMs, lines: [] })
    else previous?.lines.push(p) // Paragraphs before the first header are the preamble.
  }
  return turns.map((turn, i) => ({
    startMs: turn.startMs,
    endMs: turns[i + 1]?.startMs ?? turn.startMs,
    text: toText(turn.lines),
  }))
}

function headerStartMs(paragraph: string): number | null {
  const match = HEADER.exec(paragraph)
  if (!match) return null
  const [, , a, b, c] = match
  const [h, m, s] = c === undefined ? [0, Number(a), Number(b)] : [Number(a), Number(b), Number(c)]
  return ((h * 60 + m) * 60 + s) * 1000
}

const toText = (lines: readonly string[]): string =>
  collapseWhitespace(stripCueMarkup(lines.join('\n')))

function decodeXml(text: string): string {
  return text.replace(XML_ENTITY, (entity, dec?: string, hex?: string) => {
    if (dec !== undefined) return String.fromCodePoint(Number(dec))
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16))
    return NAMED_ENTITIES[entity.toLowerCase()] ?? entity
  })
}
