import type { Cue } from './cue'
import { parseTimedBlocks } from './timed-blocks'

/**
 * Parses a SubRip (.srt) file into cues (F1.5, Architecture §4.2 import).
 *
 * Handles numeric index lines, comma or dot milliseconds, coordinates after the timing
 * (`X1:… Y1:…`), `<i>/<b>/<font>` tags, ASS overrides like `{\an8}`, multi-line payloads,
 * and missing blank lines between cues.
 * Returns cues sorted by start time with empty cues dropped; an unparseable file yields `[]`.
 */
export function parseSrt(raw: string): Cue[] {
  return parseTimedBlocks(raw)
}
