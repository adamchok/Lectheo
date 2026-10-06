import { type Cue, collapseWhitespace, normalizeNewlines, parseTimingLine } from './cue'
import { parseSrt } from './parse-srt'
import { parseVtt } from './parse-vtt'
import { splitSentences } from './sentences'
import { stripSpeakersFromCues } from './strip-speakers'

export type TranscriptFormat = 'vtt' | 'srt' | 'docx' | 'text'

export interface ParsedTranscript {
  readonly format: TranscriptFormat
  /** Speaker-stripped cues. Untimed text uses `startMs = endMs = 0`. */
  readonly cues: readonly Cue[]
  readonly hasTimestamps: boolean
  /** End of the last cue, or null when there are no timestamps. */
  readonly durationMs: number | null
}

/** How many leading non-empty lines are inspected when sniffing the format. */
const SNIFF_LINES = 30
/** Plain-text paragraphs longer than this are cut into sentence chunks. */
export const MAX_PLAIN_CHUNK_CHARS = 800

/**
 * Detects the transcript format from content (F1.5, F1.7): `WEBVTT` header → vtt; a timing
 * line with comma milliseconds → srt; any other timing line → vtt; otherwise plain text.
 */
export function detectTranscriptFormat(raw: string): TranscriptFormat {
  const text = normalizeNewlines(raw).trimStart()
  if (/^WEBVTT(?:\s|$)/.test(text)) return 'vtt'
  const lines = text.split('\n').filter((l) => l.trim().length > 0).slice(0, SNIFF_LINES)
  const timing = lines.find((line) => parseTimingLine(line) !== null)
  if (timing === undefined) return 'text'
  return /\d,\d/.test(timing) ? 'srt' : 'vtt'
}

/**
 * Parses an uploaded transcript (Architecture §4.3 `parseTranscript`, F1.5 / F1.7 / §9
 * "Transcript has no timestamps"). Speaker names are stripped in every format.
 *
 * Plain text → `hasTimestamps = false`, `durationMs = null`, cues are paragraphs (long ones cut
 * into sentence chunks) with `0, 0` times. An empty or unparseable file yields `cues = []`;
 * the caller turns that into `422 unprocessable_input`.
 */
export function parseTranscript(raw: string): ParsedTranscript {
  const format = detectTranscriptFormat(raw)
  if (format === 'text') {
    return { format, cues: parsePlainText(raw), hasTimestamps: false, durationMs: null }
  }
  const parsed = format === 'srt' ? parseSrt(raw) : parseVtt(raw)
  const cues = stripSpeakersFromCues(parsed)
  const durationMs = cues.reduce((max, cue) => Math.max(max, cue.endMs), 0)
  return { format, cues, hasTimestamps: true, durationMs }
}

function parsePlainText(raw: string): Cue[] {
  const paragraphs = normalizeNewlines(raw)
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)

  // Strip speakers line by line so "Name:" prefixes on every line are caught.
  const asLineCues = paragraphs.map((p) => ({ startMs: 0, endMs: 0, text: p }))
  return stripSpeakersFromCues(asLineCues)
    .flatMap((cue) => chunkParagraph(collapseWhitespace(cue.text)))
    .map((text) => ({ startMs: 0, endMs: 0, text }))
}

function chunkParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_PLAIN_CHUNK_CHARS) return [paragraph]
  const chunks: string[] = []
  let current = ''
  for (const sentence of splitSentences(paragraph)) {
    const candidate = current ? `${current} ${sentence}` : sentence
    if (current && candidate.length > MAX_PLAIN_CHUNK_CHARS) {
      chunks.push(current)
      current = sentence
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks
}
