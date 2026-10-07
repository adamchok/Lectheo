import type { Cue } from './cue'

/*
 * YouTube transcripts from Gemini (F10.5, spike docs/spikes/youtube-transcripts.md §4): the video
 * is transcribed in 2-minute chunks, each chunk's "H:MM:SS" cues are converted to ms, and the
 * chunks are stitched with the spike's 4-step rule. Pure functions; the pipeline does the I/O.
 */

/** Chunk length: longer requests drift ~10 s per minute (spike §4). */
export const VIDEO_CHUNK_MS = 120_000
/** Re-time pace for a mis-stamped cue: ≈ 170 words per minute. */
export const MS_PER_WORD = 350
/** A trusted cue may start this far before / after its chunk. */
const EARLY_GRACE_MS = 1_000
const LATE_GRACE_MS = 2_000
/** Stamps this far before the chunk mean the model answered clip-relative. */
const RELATIVE_STAMP_SLACK_MS = 60_000
/**
 * "No large gaps" (F10.5): a silence longer than this between cues fails the transcript, unless
 * chunks still empty after the retry pass (real silence: an exam, a demo) cover it.
 */
export const MAX_TRANSCRIPT_GAP_MS = 10 * 60_000

export interface VideoChunk {
  readonly startMs: number
  readonly endMs: number
}

/** A cue as Gemini returns it: video-timeline stamps "H:MM:SS", "MM:SS" or "SS(.s)". */
export interface StampCue {
  readonly start: string
  readonly end: string
  readonly text: string
}

export interface ChunkCues {
  readonly chunk: VideoChunk
  readonly cues: readonly Cue[]
}

/** `[start, start + 120 s)` chunks covering the video; a short remainder joins the last chunk. */
export function chunkPlan(durationMs: number, chunkMs = VIDEO_CHUNK_MS): VideoChunk[] {
  const chunks: VideoChunk[] = []
  for (let t = 0; t < durationMs; t += chunkMs) {
    const endMs = durationMs - (t + chunkMs) < chunkMs / 2 ? durationMs : t + chunkMs
    chunks.push({ startMs: t, endMs })
    if (endMs === durationMs) break
  }
  return chunks
}

/** "1:02:03" or "00:10:03,500" → ms. Non-numeric parts make NaN (dropped by stampCues). */
export function stampToMs(stamp: string): number {
  return Math.round(
    stamp
      .trim()
      .replace(',', '.')
      .split(':')
      .reduce((acc, part) => acc * 60 + Number(part), 0) * 1000,
  )
}

/** "H:MM:SS" for prompts. */
export function formatStamp(ms: number): string {
  const s = Math.floor(ms / 1000)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${Math.floor(s / 3600)}:${mm}:${ss}`
}

/** Stamp cues → ms cues. Stamps before the chunk are read as chunk-relative (spike §1). */
export function stampCues(cues: readonly StampCue[], chunk: VideoChunk): Cue[] {
  const first = cues[0]
  const relative =
    first !== undefined && stampToMs(first.start) < chunk.startMs - RELATIVE_STAMP_SLACK_MS
  const base = relative ? chunk.startMs : 0
  return cues
    .map((c) => ({
      startMs: base + stampToMs(c.start),
      endMs: base + stampToMs(c.end),
      text: c.text.trim(),
    }))
    .filter((c) => c.text.length > 0 && Number.isFinite(c.startMs) && Number.isFinite(c.endMs))
}

const inChunk = (startMs: number, chunk: VideoChunk): boolean =>
  startMs >= chunk.startMs - EARLY_GRACE_MS && startMs < chunk.endMs + LATE_GRACE_MS

const words = (text: string): string[] => text.trim().split(/\s+/).filter(Boolean)
const normWord = (word: string | undefined): string =>
  (word ?? '').toLowerCase().replace(/[^a-z0-9']/g, '')

/**
 * The spike's stitching rule (§4):
 * 1. chunks in order, their cues concatenated;
 * 2. a cue is trusted when it starts inside its chunk (−1 s / +2 s) and not before the previous cue;
 * 3. otherwise it is re-timed right after the previous cue at ~350 ms per word, capped at the
 *    chunk end (fixes an hour/minute slip such as "1:00:03" for "0:10:03" without losing text);
 * 4. a chunk's first word is dropped when it repeats the previous chunk's last word.
 */
export function stitchChunks(parts: readonly ChunkCues[]): Cue[] {
  const kept: Cue[] = []
  for (const { chunk, cues } of parts) {
    cues.forEach((cue, i) => {
      const last = kept.at(-1)
      const ws = words(cue.text)
      const lastWord = last ? normWord(words(last.text).at(-1)) : ''
      const dupe = i === 0 && lastWord !== '' && normWord(ws[0]) === lastWord
      const text = (dupe ? ws.slice(1) : ws).join(' ')
      if (!text) return
      const retimedEnd = (startMs: number): number =>
        Math.min(startMs + words(text).length * MS_PER_WORD, Math.max(chunk.endMs, startMs))
      const trusted = inChunk(cue.startMs, chunk) && cue.startMs >= (last?.startMs ?? 0)
      if (trusted) {
        // A slipped end ("0:19:47 → 1:20:00") is capped to the chunk, else re-timed by length.
        const capped = Math.min(cue.endMs, chunk.endMs + LATE_GRACE_MS)
        const endMs = capped >= cue.startMs ? capped : retimedEnd(cue.startMs)
        kept.push({ startMs: cue.startMs, endMs, text })
        return
      }
      // Never before the previous cue, even when it already sits at the chunk end.
      const startMs = Math.max(
        Math.min(Math.max(last?.endMs ?? chunk.startMs, chunk.startMs), chunk.endMs),
        last?.startMs ?? 0,
      )
      kept.push({ startMs, endMs: retimedEnd(startMs), text })
    })
  }
  return kept
}

/** Share of a chunk's cues that stitching would re-time (outside the chunk or out of order). */
export function untrustedShare(cues: readonly Cue[], chunk: VideoChunk): number {
  if (cues.length === 0) return 0
  const bad = cues.filter(
    (c, i) => !inChunk(c.startMs, chunk) || c.startMs < (cues[i - 1]?.startMs ?? 0),
  ).length
  return bad / cues.length
}

/**
 * Chunks worth one retry (F10.5): empty while a neighbour has speech, or with most cues
 * untrusted. Returns their indexes.
 */
export function chunksToRetry(parts: readonly ChunkCues[]): number[] {
  const hasSpeech = (i: number): boolean => (parts[i]?.cues.length ?? 0) > 0
  return parts.flatMap(({ chunk, cues }, i) => {
    const emptyAmongSpeech = cues.length === 0 && (hasSpeech(i - 1) || hasSpeech(i + 1))
    return emptyAmongSpeech || untrustedShare(cues, chunk) > 0.5 ? [i] : []
  })
}

/** How much of [from, to) the given chunks cover. */
function covered(from: number, to: number, chunks: readonly VideoChunk[]): number {
  return chunks.reduce(
    (sum, c) => sum + Math.max(0, Math.min(to, c.endMs) - Math.max(from, c.startMs)),
    0,
  )
}

/**
 * F10.5's checks on the stitched transcript: in order, inside the video (start and end), no
 * large gaps. `silent` = chunks still empty after the retry pass; the gaps they cover are real
 * silence (an exam, a demo).
 * Returns the problems found ([] when valid).
 */
export function checkVideoCues(
  cues: readonly Cue[],
  durationMs: number,
  silent: readonly VideoChunk[] = [],
): string[] {
  const problems: string[] = []
  cues.forEach((c, i) => {
    const prev = cues[i - 1]
    if (prev && c.startMs < prev.startMs) problems.push(`cue ${i} starts before cue ${i - 1}`)
    if (c.startMs < 0 || c.startMs > durationMs + LATE_GRACE_MS) {
      problems.push(`cue ${i} starts outside the video`)
    }
    if (c.endMs < c.startMs || c.endMs > durationMs + LATE_GRACE_MS) {
      problems.push(`cue ${i} ends outside the video`)
    }
    const gap = prev ? c.startMs - prev.endMs - covered(prev.endMs, c.startMs, silent) : 0
    if (gap > MAX_TRANSCRIPT_GAP_MS) {
      problems.push(`no speech for ${Math.round(gap / 60_000)} min at cue ${i}`)
    }
  })
  return problems
}

/** Common English function words; real English speech is roughly 40 % these. */
const ENGLISH_WORDS = new Set(
  (
    'the a an and or but of to in on at for with from by as is are was were be been it this ' +
    'that these those you we they he she i so if not no do does did have has can will what ' +
    'which there here then than just about'
  ).split(' '),
)
const MIN_WORDS_TO_JUDGE = 50
const MIN_ENGLISH_SHARE = 0.15

/**
 * F10.3: the uploader-set audio language can be wrong, so the transcript itself is checked.
 * ponytail: a stop-word share, not a language model; enough to catch a French lecture labelled
 * `en`. Upgrade path: a proper language-ID library if mixed-language lectures show up.
 */
export function looksEnglish(text: string): boolean {
  const ws = words(text).map(normWord).filter(Boolean)
  if (ws.length < MIN_WORDS_TO_JUDGE) return true
  return ws.filter((w) => ENGLISH_WORDS.has(w)).length / ws.length >= MIN_ENGLISH_SHARE
}
