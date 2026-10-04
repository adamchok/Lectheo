import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { parseTranscript, segmentCues, type Segment } from '@lectheo/domain'
import { cachePath } from './cache'
import type { LecturePlan } from './curriculum'

/** 'h:mm:ss' → ms. */
export const clockMs = (clock: string): number =>
  clock.split(':').reduce((acc, part) => acc * 60 + Number(part), 0) * 1000

async function downloadSrt(plan: LecturePlan): Promise<string> {
  const path = cachePath(`srt/lecture-${plan.key}.srt`)
  if (existsSync(path)) return readFileSync(path, 'utf8')
  const res = await fetch(plan.srtUrl)
  if (!res.ok) throw new Error(`${plan.srtUrl}: HTTP ${res.status}`)
  const text = await res.text()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  return text
}

/**
 * Official subtitles → ≤ 40 s transcript segments of the core window, in video time (Architecture
 * §4.3 parseTranscript + segment; the same code user transcripts go through). Only cues wholly
 * inside the window are kept, so every segment lies within it.
 */
export async function windowSegments(plan: LecturePlan): Promise<Segment[]> {
  const parsed = parseTranscript(await downloadSrt(plan))
  const offset = clockMs(plan.srtOffset)
  const start = clockMs(plan.start)
  const end = clockMs(plan.end)
  const cues = parsed.cues
    .map((c) => ({ ...c, startMs: c.startMs - offset, endMs: c.endMs - offset }))
    .filter((c) => c.startMs >= start && c.endMs <= end)
  if (cues.length === 0) throw new Error(`${plan.key}: no cues in ${plan.start}–${plan.end}`)
  return segmentCues(cues, { hasTimestamps: true })
}
