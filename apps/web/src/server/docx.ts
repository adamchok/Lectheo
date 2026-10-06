import 'server-only'
import { type ParsedTranscript, parseTeamsDocx } from '@lectheo/domain'
import { strFromU8, unzipSync } from 'fflate'

/*
 * Teams .docx transcripts (F1.5). A .docx is a zip; only word/document.xml is read, with fflate
 * (≈ 8 kB min+gz for unzipSync, server bundle only) instead of mammoth (≈ 600 kB, renders HTML).
 */

export const NOT_TEAMS_DOCX =
  "This .docx doesn't look like a Teams transcript. Download the .vtt from Teams instead."
/** Inflated document.xml cap, so a 2 MB upload can't zip-bomb the server. fflate inflates into
 * a buffer of the declared size and never grows it, so a lying header can't exceed this either. */
const MAX_DOCUMENT_XML_BYTES = 32 * 1024 * 1024
const DOCUMENT_XML = 'word/document.xml'

/** Parses a Teams .docx transcript. Null when it isn't a zip, has no body or isn't Teams. */
export function parseDocxTranscript(bytes: Uint8Array): ParsedTranscript | null {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes, {
      filter: (f) => f.name === DOCUMENT_XML && f.originalSize <= MAX_DOCUMENT_XML_BYTES,
    })
  } catch {
    return null // Not a zip, or a corrupt one.
  }
  const xml = files[DOCUMENT_XML]
  return xml ? parseTeamsDocx(strFromU8(xml)) : null
}
