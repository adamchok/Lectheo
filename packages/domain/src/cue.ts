/**
 * Shared transcript cue shape and low-level helpers used by the VTT / SRT parsers
 * (Architecture §4.2 import, §4.3 parseTranscript).
 */

/** One timed caption cue. Times are media milliseconds; untimed text uses `0, 0`. */
export interface Cue {
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const MS_DIGITS = 3

/**
 * Matches a caption timestamp: `hh:mm:ss.mmm`, `mm:ss.mmm`, comma or dot separator,
 * and an optional fractional part (some exporters omit it).
 */
const TIMESTAMP_SOURCE = String.raw`(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?`
const TIMING_LINE = new RegExp(`^\\s*${TIMESTAMP_SOURCE}\\s*-->\\s*${TIMESTAMP_SOURCE}`)

/** Parses a cue timing line (`start --> end [settings]`). Returns null if it is not one. */
export function parseTimingLine(line: string): { startMs: number; endMs: number } | null {
  const match = TIMING_LINE.exec(line)
  if (!match) return null
  const startMs = toMs(match[1], match[2], match[3], match[4])
  const endMs = toMs(match[5], match[6], match[7], match[8])
  return { startMs, endMs: Math.max(endMs, startMs) }
}

/** True when the line contains a `-->` timing arrow (cheap pre-check). */
export function looksLikeTimingLine(line: string): boolean {
  return TIMING_LINE.test(line)
}

function toMs(
  hours: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
  fraction: string | undefined,
): number {
  const h = Number(hours ?? 0)
  const m = Number(minutes ?? 0)
  const s = Number(seconds ?? 0)
  // "5" means 500 ms, "05" means 50 ms: pad to 3 digits.
  const ms = fraction ? Number(fraction.padEnd(MS_DIGITS, '0')) : 0
  return ((h * MINUTES_PER_HOUR + m) * SECONDS_PER_MINUTE + s) * MS_PER_SECOND + ms
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
  '&lrm;': '',
  '&rlm;': '',
}

/**
 * Removes markup from a caption payload: HTML-ish tags (`<c>`, `<i>`, `<v Name>`, `<font>`),
 * inline timestamps (`<00:01:02.000>`), ASS overrides (`{\an8}`), and decodes basic entities.
 */
export function stripCueMarkup(text: string): string {
  return text
    // `[^<>]` / `[^{}]` keep these linear on unclosed `<` / `{` runs.
    .replace(/<[^<>]*>/g, '')
    .replace(/\{\\[^{}]*\}/g, '')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|lrm|rlm|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
}

/** Collapses runs of whitespace into single spaces and trims. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Normalizes line endings and strips a UTF-8 BOM. */
export function normalizeNewlines(raw: string): string {
  return raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
}

/** Splits text into blank-line separated blocks of non-empty lines. */
export function splitBlocks(raw: string): string[][] {
  return normalizeNewlines(raw)
    .split(/\n[ \t]*\n/)
    .map((block) => block.split('\n').filter((line) => line.trim().length > 0))
    .filter((lines) => lines.length > 0)
}

/**
 * Cleans up a parsed cue list: drops empty cues, sorts by start (stable), and merges
 * consecutive cues with identical text (rolling auto-captions) by extending the end time.
 */
export function finalizeCues(cues: readonly Cue[]): Cue[] {
  const sorted = cues
    .filter((cue) => cue.text.length > 0)
    .map((cue, order) => ({ cue, order }))
    .sort((a, b) => a.cue.startMs - b.cue.startMs || a.order - b.order)
    .map(({ cue }) => cue)

  // Local accumulator only; inputs are never mutated.
  const merged: Cue[] = []
  for (const cue of sorted) {
    const prev = merged.at(-1)
    if (prev && prev.text === cue.text) {
      merged[merged.length - 1] = { ...prev, endMs: Math.max(prev.endMs, cue.endMs) }
    } else {
      merged.push(cue)
    }
  }
  return merged
}
