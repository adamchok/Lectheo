import { type Cue, collapseWhitespace, finalizeCues, parseTimingLine } from './cue'
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
 *
 * The input is untrusted and up to several MB, so every regex here is linear: character classes
 * stop at `<` / `>`, and nothing scans ahead with `[\s\S]*`.
 */

/**
 * `Speaker Name<tab>0:03` or `Speaker Name   1:02:03`. The name is required, so a text
 * paragraph that is just "10:30" isn't a header. A tab or 2+ spaces may follow any name.
 */
const HEADER = /^(\S.{0,79}?)(?:\t| {2})\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/
/**
 * One space, a `\n` from `<w:br/>`, or nothing (a name run straight into a time run) between
 * name and time, as some Teams exports may write it: only when the name has no digit and no
 * comma, which a preamble date ("6 October 2026, 14:00") always has.
 * ponytail: a text paragraph like "Back at 12:30" also matches; the monotonic guard below only
 * catches it when the time goes backwards. Check against the doc's repeat speakers if seen.
 */
const LOOSE_HEADER = /^(?=\S)([^\d,\n]{1,80}?)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/
/** A repeated arrow-layout first line is a speaker only if it reads like a name. */
const MAX_SPEAKER_CHARS = 60
const SENTENCE_END = /[.?!…]$/
/** Teams notices such as "Jane Doe started transcription": not speech. */
const NOTICE = /\s(?:started|stopped) transcription$/
/**
 * One pass over the body: paragraph open (or self-closing) / close, text runs, tabs and breaks.
 * `<w:p\b` doesn't match `<w:pPr>` / `<w:proofErr>`; `<w:t[\s>]` doesn't match `<w:tab>` /
 * `<w:tbl>`; `<w:delText>` / `<w:instrText>` (deleted text, field codes) are never read; a pPr
 * tab stop (`<w:tab w:val=… />`) isn't a run tab.
 */
const TOKEN =
  /<w:p\b[^<>]*?(\/?)>|<\/w:p>|<w:t(?:\s[^<>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:(?:br|cr)\b[^<>]*\/>/g
const XML_ENTITY = /&(?:#(\d+)|#x([\da-f]+)|amp|lt|gt|quot|apos);/gi
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
}
const MAX_CODE_POINT = 0x10ffff
/** Speaker lines repeat; a first line seen at the top of this many blocks is a speaker. */
const MIN_SPEAKER_REPEATS = 2

/** Plain text of each `<w:p>` in a WordprocessingML body, in order. */
export function docxParagraphs(documentXml: string): string[] {
  const paragraphs: string[] = []
  let current: string | null = null
  const close = (): void => {
    if (current !== null) paragraphs.push(decodeXml(current).trim())
    current = null
  }
  for (const [token, selfClosing, text] of documentXml.matchAll(TOKEN)) {
    if (token.startsWith('<w:p')) {
      close() // An unclosed paragraph ends where the next one starts.
      current = ''
      if (selfClosing) close()
    } else if (token === '</w:p>') {
      close()
    } else if (current !== null) {
      current += text ?? (token.startsWith('<w:tab') ? '\t' : '\n')
    }
  }
  close()
  return paragraphs
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

/**
 * Teams writes a speaker paragraph under every timing line, or under none. Speakers are the
 * first lines that open at least `MIN_SPEAKER_REPEATS` blocks; when the document has any, the
 * first line of every block is the speaker (also a block that holds only the name). Otherwise
 * every line is text.
 */
function parseArrowLayout(paragraphs: readonly string[]): Cue[] {
  const blocks: { startMs: number; endMs: number; lines: string[] }[] = []
  for (const p of paragraphs) {
    const timing = parseTimingLine(p)
    if (timing) blocks.push({ ...timing, lines: [] })
    else blocks.at(-1)?.lines.push(p)
  }
  const firstLines = new Map<string, number>()
  for (const { lines } of blocks) {
    const first = lines[0]
    if (first !== undefined) firstLines.set(first, (firstLines.get(first) ?? 0) + 1)
  }
  // "Okay." opening two blocks is speech, not a speaker: names are short and unpunctuated.
  const hasSpeakers = [...firstLines].some(
    ([line, n]) =>
      n >= MIN_SPEAKER_REPEATS && line.length <= MAX_SPEAKER_CHARS && !SENTENCE_END.test(line),
  )
  return blocks.map(({ startMs, endMs, lines }) => ({
    startMs,
    endMs,
    text: toText(hasSpeakers ? lines.slice(1) : lines),
  }))
}

function parseHeaderLayout(paragraphs: readonly string[]): Cue[] {
  const turns: { startMs: number; lines: string[] }[] = []
  for (const p of paragraphs) {
    const startMs = headerStartMs(p)
    const previous = turns.at(-1)
    // Turns never go back in time, so "Jane Doe  0:03" quoted after 12:04 stays text.
    if (startMs !== null && startMs >= (previous?.startMs ?? 0)) turns.push({ startMs, lines: [] })
    else previous?.lines.push(p) // Paragraphs before the first header are the preamble.
  }
  // ponytail: Teams gives no end time, so the last turn ends where it starts and durationMs
  // undercounts by that turn; the media's own duration covers the gap on the watch page.
  return turns.map((turn, i) => ({
    startMs: turn.startMs,
    endMs: turns[i + 1]?.startMs ?? turn.startMs,
    text: toText(turn.lines),
  }))
}

function headerStartMs(paragraph: string): number | null {
  const match = HEADER.exec(paragraph) ?? LOOSE_HEADER.exec(paragraph)
  if (!match) return null
  const [, , a, b, c] = match
  const [h, m, s] = c === undefined ? [0, Number(a), Number(b)] : [Number(a), Number(b), Number(c)]
  return ((h * 60 + m) * 60 + s) * 1000
}

/** Docx text is plain (no cue markup), so `<` and `>` from `&lt;` / `&gt;` are kept as text. */
const toText = (lines: readonly string[]): string => collapseWhitespace(lines.join('\n'))

/** Decodes the 5 XML entities and numeric references; invalid code points and controls → ''. */
function decodeXml(text: string): string {
  return text.replace(XML_ENTITY, (entity, dec?: string, hex?: string) => {
    if (dec === undefined && hex === undefined) return NAMED_ENTITIES[entity.toLowerCase()] ?? ''
    return safeChar(dec !== undefined ? Number(dec) : Number.parseInt(hex ?? '', 16))
  })
}

function safeChar(codePoint: number): string {
  const isControl = codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a
  const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff
  if (!Number.isSafeInteger(codePoint) || codePoint > MAX_CODE_POINT || isControl || isSurrogate) {
    return ''
  }
  return String.fromCodePoint(codePoint)
}
