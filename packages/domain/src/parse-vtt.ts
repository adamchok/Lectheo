import type { Cue } from './cue'
import { parseTimedBlocks } from './timed-blocks'

/** Block types that carry no captions (WebVTT spec: header, comments, styles, regions). */
const VTT_NON_CUE_BLOCK = /^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/

/**
 * Parses a WebVTT file into cues (F1.5, Architecture §4.2 import).
 *
 * Tolerates Teams / Zoom / Panopto / YouTube quirks: cue identifiers, NOTE / STYLE / REGION
 * blocks, `<v Name>` voice tags (removed, so the speaker name is dropped), inline tags such as
 * `<c>` and `<00:01:02.000>`, optional hours, comma or dot milliseconds, missing blank lines
 * between cues, and rolling auto-captions that repeat the previous line.
 *
 * Speaker *prefixes* in the text ("Name:") are not removed here; see `stripSpeakersFromCues`.
 * Returns cues sorted by start time with empty cues dropped; an unparseable file yields `[]`.
 */
export function parseVtt(raw: string): Cue[] {
  return parseTimedBlocks(raw, VTT_NON_CUE_BLOCK)
}
