import {
  type Cue,
  collapseWhitespace,
  finalizeCues,
  parseTimingLine,
  splitBlocks,
  stripCueMarkup,
} from './cue'

interface RawCue {
  readonly startMs: number
  readonly endMs: number
  readonly lines: readonly string[]
}

/**
 * Shared engine for VTT and SRT: blank-line separated blocks, each with optional identifier
 * line(s) before a `start --> end` timing line, then the caption payload.
 *
 * @param skipBlock blocks whose first line matches (and is not a timing line) carry no captions
 *   themselves (e.g. WEBVTT header, NOTE, STYLE); cues that follow them in the same block are kept.
 */
export function parseTimedBlocks(raw: string, skipBlock?: RegExp): Cue[] {
  const rawCues = splitBlocks(raw).flatMap((lines) => parseBlock(lines, skipBlock))
  const cues = rawCues.map((cue, i) => toCue(cue, rawCues[i - 1]))
  return finalizeCues(cues)
}

function parseBlock(lines: readonly string[], skipBlock: RegExp | undefined): RawCue[] {
  const first = lines[0] ?? ''
  const isNonCueBlock = skipBlock?.test(first) === true && parseTimingLine(first) === null
  const firstTiming = lines.findIndex((line) => parseTimingLine(line) !== null)
  if (firstTiming === -1) return []
  // Skip everything before the first timing line of a non-cue block.
  const body = isNonCueBlock ? lines.slice(firstTiming) : lines

  const cues: RawCue[] = []
  let current: { startMs: number; endMs: number; lines: string[] } | null = null
  for (const line of body) {
    const timing = parseTimingLine(line)
    if (timing) {
      if (current) cues.push(withoutTrailingId(current))
      current = { ...timing, lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
    // Lines before the first timing line are cue identifiers / SRT indexes: ignored.
  }
  if (current) cues.push(current)
  return cues
}

/**
 * When two cues are not separated by a blank line, the last line before the second timing
 * line is that cue's identifier, not caption text of the first cue.
 */
function withoutTrailingId(cue: { startMs: number; endMs: number; lines: string[] }): RawCue {
  return { ...cue, lines: cue.lines.length > 1 ? cue.lines.slice(0, -1) : [...cue.lines] }
}

function toCue(cue: RawCue, previous: RawCue | undefined): Cue {
  const previousLast = previous?.lines.at(-1)?.trim()
  // Rolling captions (YouTube auto-subs) repeat the previous cue's last line first.
  const lines =
    cue.lines.length > 1 && cue.lines[0]?.trim() === previousLast ? cue.lines.slice(1) : cue.lines
  const text = collapseWhitespace(stripCueMarkup(lines.join('\n')))
  return { startMs: cue.startMs, endMs: cue.endMs, text }
}
