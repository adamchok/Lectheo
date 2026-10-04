/** Abbreviations that end with a dot but do not end a sentence. */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'e.g.', 'i.e.', 'etc.', 'vs.', 'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'st.', 'fig.', 'no.',
  'approx.', 'cf.', 'al.',
])

const TERMINAL = /[.!?…]["'”’)\]]*$/

/**
 * True when a text fragment ends a sentence (terminal punctuation, not a known abbreviation).
 * Used by segmentation to prefer sentence boundaries (Architecture §4.3 "segment").
 */
export function endsSentence(text: string): boolean {
  const trimmed = text.trim()
  if (!TERMINAL.test(trimmed)) return false
  const lastWord = trimmed.split(/\s+/).at(-1)?.toLowerCase() ?? ''
  return !ABBREVIATIONS.has(lastWord)
}

/**
 * Splits text into sentences. A boundary is terminal punctuation followed by whitespace and an
 * uppercase letter, digit or opening quote, so "e.g. the" or "O(n). then" style fragments stay
 * joined. Never returns empty strings.
 */
export function splitSentences(text: string): string[] {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0)
  const sentences: string[] = []
  let current: string[] = []
  words.forEach((word, i) => {
    current.push(word)
    const next = words[i + 1]
    if (next !== undefined && endsSentence(word) && /^["'“‘(\[]?[\p{Lu}\p{N}]/u.test(next)) {
      sentences.push(current.join(' '))
      current = []
    }
  })
  if (current.length > 0) sentences.push(current.join(' '))
  return sentences
}
