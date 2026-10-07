/**
 * F10.9 validation: the build's transcriber (packages/ai `transcriber` role on the direct Google
 * API, packages/domain chunking + stitching, the pipeline's one retry of bad chunks) scored with
 * the spike's scorer against a second lecture with human captions. No database.
 *
 *   cd scripts && pnpm exec tsx --env-file=../apps/web/.env.local spikes/youtube-validate.ts \
 *     [--from 0:10:00 --to 0:25:00]
 *
 * Default: MIT 6.006 Spring 2020, Lecture 1 (`ZA-tUyM_y7s`), official OCW captions (.vtt).
 * Raw output + the call ledger go to scripts/spikes/out/ (gitignored). Hard stop at $2.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { runTask, transcribeChunkTask, type LlmCallEntry } from '@lectheo/ai'
import {
  chunkPlan,
  chunksToRetry,
  parseVtt,
  stampCues,
  stampToMs,
  stitchChunks,
  type Cue,
  type VideoChunk,
} from '@lectheo/domain'
import { score } from './youtube-transcripts'

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out')
const LEDGER = join(OUT, 'validate-ledger.jsonl')
const BUDGET_USD = 2
const VIDEO = 'ZA-tUyM_y7s'
const VTT_URL =
  'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/dd0823c3851b5df3a7e0b447eaa76050_ZA-tUyM_y7s.vtt'
/** ≈ $0.42 per hour of video (spike) → a generous per-minute estimate for the budget check. */
const EST_USD_PER_MIN = 0.012

const out = (line: string): void => void process.stdout.write(`${line}\n`)

function spent(): number {
  if (!existsSync(LEDGER)) return 0
  return readFileSync(LEDGER, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .reduce((sum, l) => sum + ((JSON.parse(l) as LlmCallEntry).costUsd ?? 0), 0)
}

async function officialCues(): Promise<Cue[]> {
  const file = join(OUT, `${VIDEO}.vtt`)
  if (!existsSync(file)) writeFileSync(file, await (await fetch(VTT_URL)).text())
  return parseVtt(readFileSync(file, 'utf8'))
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      from: { type: 'string', default: '0:10:00' },
      to: { type: 'string', default: '0:25:00' },
    },
  })
  mkdirSync(OUT, { recursive: true })
  if (!process.env['GOOGLE_GENERATIVE_AI_API_KEY']) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set')
  }
  const fromMs = stampToMs(values.from)
  const toMs = stampToMs(values.to)
  const estimate = ((toMs - fromMs) / 60_000) * EST_USD_PER_MIN * 2 // ×2: room for retries
  if (spent() + estimate > BUDGET_USD) {
    throw new Error(`budget: spent $${spent().toFixed(3)} + est $${estimate.toFixed(2)}`)
  }

  const calls: LlmCallEntry[] = []
  const ctx = {
    fake: false,
    hooks: {
      logCall: async (entry: LlmCallEntry) => {
        calls.push(entry)
        appendFileSync(LEDGER, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`)
      },
    },
  }
  const chunks: VideoChunk[] = chunkPlan(toMs - fromMs).map((c) => ({
    startMs: c.startMs + fromMs,
    endMs: c.endMs + fromMs,
  }))
  const transcribe = async (chunk: VideoChunk): Promise<Cue[]> => {
    const { output } = await runTask(transcribeChunkTask, { videoId: VIDEO, ...chunk }, ctx)
    return stampCues(output.cues, chunk)
  }

  const started = Date.now()
  const first = await Promise.all(chunks.map(transcribe)) // ≤ 10 chunks for ≤ 20 minutes
  const parts = chunks.map((chunk, i) => ({ chunk, cues: first[i] ?? [] }))
  const retry = chunksToRetry(parts)
  const second = await Promise.all(retry.map((i) => transcribe(chunks[i] as VideoChunk)))
  const retried = new Map(retry.map((idx, k) => [idx, second[k] ?? []]))
  const cues = stitchChunks(
    parts.map((p, i) => ({ chunk: p.chunk, cues: retried.get(i) ?? p.cues })),
  )
  const wallS = (Date.now() - started) / 1000

  const clip = { key: 'v', startS: fromMs / 1000, endS: toMs / 1000 }
  const s = score(await officialCues(), cues, clip)
  const costUsd = calls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0)
  const perHour = (costUsd * 3_600_000) / (toMs - fromMs)
  const result = {
    video: VIDEO,
    from: values.from,
    to: values.to,
    chunks: chunks.length,
    retried: retry.length,
    wallS,
    costUsd,
    perHour,
    ...s,
  }
  writeFileSync(join(OUT, `validate-${VIDEO}.json`), JSON.stringify({ result, cues }, null, 2))
  const pct = (x: number): string => `${(x * 100).toFixed(1)}%`
  out(
    `${VIDEO} ${values.from}–${values.to}: WER=${pct(s.wer)} drift p50=${s.driftMedianS}s ` +
      `p95=${s.driftP95S}s ≤5s=${pct(s.within5s)} words ${s.hypWords}/${s.refWords}`,
  )
  out(
    `   missing=${JSON.stringify(s.missing)} invented=${JSON.stringify(s.invented)} ` +
      `order=${s.outOfOrder} outside=${s.outsideClip}`,
  )
  out(
    `   ${chunks.length} chunks (${retry.length} retried), ${wallS.toFixed(1)}s, ` +
      `$${costUsd.toFixed(4)} → $${perHour.toFixed(3)}/h`,
  )
  out(`spent so far (validation ledger): $${spent().toFixed(4)} of $${BUDGET_USD}`)
}

await main()
