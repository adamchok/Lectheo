import 'server-only'
import { type ParsedTranscript, parseTeamsDocx } from '@lectheo/domain'
import { strFromU8, unzipSync } from 'fflate'

/*
 * Teams .docx transcripts (F1.5). A .docx is a zip; only word/document.xml is read, with fflate
 * (≈ 8 kB min+gz for unzipSync, server bundle only) instead of mammoth (≈ 600 kB, renders HTML).
 */

export const NOT_TEAMS_DOCX =
  "This .docx doesn't look like a Teams transcript. Download the .vtt from Teams instead."
/**
 * Inflated document.xml cap, so a 2 MB upload can't zip-bomb the server (a 2-hour Teams
 * transcript's document.xml is a few MB). fflate inflates into a buffer of the declared size and
 * never grows it, so a lying header can't exceed this either.
 */
const MAX_DOCUMENT_XML_BYTES = 8 * 1024 * 1024
/** A real .docx has a few dozen entries; more is a crafted (or lying zip64) central directory. */
export const MAX_ZIP_ENTRIES = 5000
const DOCUMENT_XML = 'word/document.xml'

/** Parses a Teams .docx transcript. Null when it isn't a zip, has no body or isn't Teams. */
export function parseDocxTranscript(bytes: Uint8Array): ParsedTranscript | null {
  let files: Record<string, Uint8Array>
  let entries = 0
  let seen = false
  try {
    files = unzipSync(bytes, {
      // Called once per central-directory record: inflate document.xml once, however often
      // it's listed, and stop walking a directory that claims too many entries.
      filter: (f) => {
        if (++entries > MAX_ZIP_ENTRIES) throw new Error('too many zip entries')
        if (f.name !== DOCUMENT_XML || seen) return false
        seen = true
        return f.originalSize <= MAX_DOCUMENT_XML_BYTES
      },
    })
  } catch {
    return null // Not a zip, a corrupt one, or too many entries.
  }
  const xml = files[DOCUMENT_XML]
  return xml ? parseTeamsDocx(strFromU8(xml)) : null
}
