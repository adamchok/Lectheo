import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { MAX_ZIP_ENTRIES, parseDocxTranscript } from './docx'

vi.mock('server-only', () => ({}))

const EOCD_SIZE = 22
const TEAMS_XML =
  '<w:document><w:body><w:p><w:r><w:t>Jane Doe  0:03</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Hash tables map keys to buckets.</w:t></w:r></w:p></w:body></w:document>'
/** Generous bound; each inflate here is microseconds, the attacks took seconds to minutes. */
const FAST_MS = 1000

/**
 * A one-file zip whose central directory lists that file `copies` times, and whose
 * end-of-central-directory record claims `claimed` entries (a lying count).
 */
function craftedZip(copies: number, claimed = copies, xml = TEAMS_XML): Uint8Array {
  const zip = zipSync({ 'word/document.xml': strToU8(xml) })
  const eocd = zip.subarray(zip.length - EOCD_SIZE)
  const view = new DataView(eocd.buffer, eocd.byteOffset)
  const cdSize = view.getUint32(12, true)
  const cdOffset = view.getUint32(16, true)
  const record = zip.subarray(cdOffset, cdOffset + cdSize)
  const out = new Uint8Array(cdOffset + cdSize * copies + EOCD_SIZE)
  out.set(zip.subarray(0, cdOffset))
  for (let i = 0; i < copies; i++) out.set(record, cdOffset + cdSize * i)
  const end = new Uint8Array(eocd)
  const endView = new DataView(end.buffer)
  endView.setUint16(8, Math.min(claimed, 0xffff), true)
  endView.setUint16(10, Math.min(claimed, 0xffff), true)
  endView.setUint32(12, cdSize * copies, true)
  out.set(end, cdOffset + cdSize * copies)
  return out
}

const elapsedMs = (fn: () => unknown): number => {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('parseDocxTranscript', () => {
  it('parses a Teams .docx', () => {
    expect(parseDocxTranscript(craftedZip(1))?.cues).toEqual([
      { startMs: 3000, endMs: 3000, text: 'Hash tables map keys to buckets.' },
    ])
  })

  it('inflates document.xml once however often the central directory repeats it', () => {
    // ~1 MB of poorly-compressible XML: ~2 ms per inflate, so 4000 inflates take ~8 s.
    const filler = Array.from(
      { length: 25_000 },
      (_, i) => `<w:p><w:r><w:t>${((i * 2654435761) >>> 0).toString(36)}</w:t></w:r></w:p>`,
    ).join('')
    const zip = craftedZip(4000, 4000, TEAMS_XML.replace('</w:body>', `${filler}</w:body>`))
    let parsed: ReturnType<typeof parseDocxTranscript> = null
    expect(elapsedMs(() => (parsed = parseDocxTranscript(zip)))).toBeLessThan(FAST_MS)
    expect(parsed).not.toBeNull()
  })

  it('refuses a central directory with too many entries (null → 422)', () => {
    expect(parseDocxTranscript(craftedZip(MAX_ZIP_ENTRIES + 1))).toBeNull()
  })

  it('stops quickly when the entry count lies', () => {
    const zip = craftedZip(1, 0xffff)
    expect(elapsedMs(() => parseDocxTranscript(zip))).toBeLessThan(FAST_MS)
  })

  it('returns null for bytes that are not a zip, or a zip without document.xml', () => {
    expect(parseDocxTranscript(strToU8('not a zip'))).toBeNull()
    expect(parseDocxTranscript(zipSync({ 'a.txt': strToU8('x') }))).toBeNull()
  })
})
