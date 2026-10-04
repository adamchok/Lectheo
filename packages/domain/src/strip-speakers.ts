import { type Cue, collapseWhitespace } from './cue'

/** Labels that look like "Word:" at line start but are content, not speakers. */
const NON_SPEAKER_LABELS: ReadonlySet<string> = new Set([
  'note', 'notes', 'example', 'examples', 'warning', 'definition', 'tip', 'hint', 'important',
  'summary', 'recall', 'remember', 'step', 'question', 'answer', 'rule', 'theorem', 'proof',
  'lemma', 'corollary', 'case', 'option', 'problem', 'solution', 'exercise', 'fact', 'key',
  'caution', 'update', 'reminder', 'so', 'okay', 'ok', 'well', 'now', 'first', 'second', 'third',
  'finally', 'also', 'but', 'and', 'then', 'here', 'there', 'this', 'that', 'why', 'what', 'how',
  'result', 'output', 'input', 'error', 'goal', 'idea', 'ps', 'todo', 'agenda',
])

/** A single-word, mixed-case label must appear at this many line starts to count as a speaker. */
export const MIN_SINGLE_WORD_SPEAKER_REPEATS = 2
/** Maximum words in a speaker label (F1.5: "1–4 capitalized words then colon"). */
export const MAX_SPEAKER_LABEL_WORDS = 4

const VOICE_TAG = /<\/?v(?:\.[^\s>]*)?(?:\s[^>]*)?>/g
/** Leading dialogue markers used by some exporters: `>>` (CS50/YouTube) or `-`. */
const DIALOGUE_DASH = /^(?:>>|-)\s*/
/** A capitalized name word, an initial ("J."), or a number ("Speaker 1"). */
const LABEL_WORD = String.raw`(?:[\p{Lu}][\p{L}\p{N}_'’\-]*\.?|\d+)`
const COLON_LABEL = new RegExp(
  String.raw`^(${LABEL_WORD}(?:[ \t]+${LABEL_WORD}){0,${MAX_SPEAKER_LABEL_WORDS - 1}})[ \t]*:(?=\s|$)`,
  'u',
)
const BRACKET_LABEL = new RegExp(
  String.raw`^\[([\p{L}][\p{L}'’.\- ]{0,40}?(?:[ \t]+\d+)?)\][ \t]*:?(?=\s|$)`,
  'u',
)

/**
 * Removes speaker names from a single caption text (F1.5 "speaker names are stripped",
 * Product Spec §8.8 privacy).
 *
 * Strips `<v Name>` voice tags anywhere, and at the start of each line: `[Name]`, plus
 * "Name:" / "NAME:" labels of 1–4 capitalized words. Mid-sentence colons are never touched.
 * To avoid eating content like "Recursion: a function that…", a single mixed-case word is only
 * stripped when it is listed in `knownSpeakers` (see `stripSpeakersFromCues`), is ALL CAPS, or is
 * a "Speaker 1"-style label; common content labels ("Note:", "Example:") are never stripped.
 */
export function stripSpeakers(text: string, knownSpeakers: ReadonlySet<string> = new Set()): string {
  const withoutVoice = text.replace(VOICE_TAG, '')
  const lines = withoutVoice.split('\n').map((line) => stripLineLabel(line, knownSpeakers))
  return collapseWhitespace(lines.join(' '))
}

/**
 * Strips speakers from every cue, first learning which single-word labels repeat across the
 * transcript (a real speaker label recurs; a content label like "Recursion:" usually doesn't).
 * Cues that become empty (e.g. only "[LAUGHTER]") are dropped.
 */
export function stripSpeakersFromCues(cues: readonly Cue[]): Cue[] {
  const knownSpeakers = findRepeatedLabels(cues.map((cue) => cue.text))
  return cues
    .map((cue) => ({ ...cue, text: stripSpeakers(cue.text, knownSpeakers) }))
    .filter((cue) => cue.text.length > 0)
}

/** Collects single-word labels that open at least `MIN_SINGLE_WORD_SPEAKER_REPEATS` lines. */
export function findRepeatedLabels(texts: readonly string[]): ReadonlySet<string> {
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const rawLine of text.replace(VOICE_TAG, '').split('\n')) {
      const label = COLON_LABEL.exec(rawLine.trim().replace(DIALOGUE_DASH, ''))?.[1]
      if (label !== undefined) counts.set(label, (counts.get(label) ?? 0) + 1)
    }
  }
  return new Set(
    [...counts].filter(([, n]) => n >= MIN_SINGLE_WORD_SPEAKER_REPEATS).map(([label]) => label),
  )
}

function stripLineLabel(rawLine: string, knownSpeakers: ReadonlySet<string>): string {
  const line = rawLine.trim()
  const hasDialogueMarker = DIALOGUE_DASH.test(line)
  const body = line.replace(DIALOGUE_DASH, '')

  const bracket = BRACKET_LABEL.exec(body)
  if (bracket) return body.slice(bracket[0].length).trim()

  const colon = COLON_LABEL.exec(body)
  if (colon?.[1] !== undefined && isSpeakerLabel(colon[1], knownSpeakers)) {
    return body.slice(colon[0].length).trim()
  }
  // `>> text` is always a dialogue marker; a bare leading "-" may be a list item or a minus.
  return hasDialogueMarker && line.startsWith('>>') ? body : line
}

function isSpeakerLabel(label: string, knownSpeakers: ReadonlySet<string>): boolean {
  const words = label.split(/\s+/)
  const firstWord = (words[0] ?? '').replace(/\.$/, '').toLowerCase()
  if (NON_SPEAKER_LABELS.has(firstWord)) return false
  if (words.length > 1) return true
  const isAllCaps = label.length > 1 && label === label.toUpperCase() && /\p{L}/u.test(label)
  return isAllCaps || knownSpeakers.has(label)
}
