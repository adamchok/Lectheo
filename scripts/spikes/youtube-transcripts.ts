/**
 * F10.1 spike: can Gemini read a public YouTube URL through Vercel AI Gateway and return a
 * timestamped transcript good enough for Lectheo? Results: docs/spikes/youtube-transcripts.md.
 * No product code, no database.
 *
 *   cd scripts && pnpm exec tsx --env-file=../apps/web/.env.local spikes/youtube-transcripts.ts <mode>
 *
 * Modes (flags: --model google/gemini-3.8-flash, --only a,b,c|h, --direct):
 *   probe     does the gateway (or --direct) accept a YouTube file part, and does it bill the
 *             whole video or only the clip? (L3, a 2-minute clip vs no clip)
 *   clips     transcribe CS50 Lecture 3 clips (CLIPS) in parallel through the gateway, then score
 *   direct    the same clips through Google's API with videoMetadata offsets. --stamps asks for
 *             H:MM:SS strings instead of integer ms; --chunk 120 splits each clip into 2-minute
 *             requests run in parallel and stitched. The build's shape:
 *               direct --stamps --chunk 120 --only a,b,c   (and --only h for a 60-minute run)
 *   score     re-score saved outputs (--as <mode>) against the official .srt, no AI calls
 *   restitch  rebuild a chunked run from its saved chunk outputs (--as, --chunk, --raw), no AI
 *   edge      edge-case videos (EDGE): oEmbed status + one 2-minute call each
 *   ytapi     YouTube Data API videos.list for every test video
 *   selftest  scorer check against the .srt itself, no AI calls
 *
 * Env: AI_GATEWAY_API_KEY + AI_GATEWAY_KEY_NAME=dev (refuses anything else),
 * GOOGLE_GENERATIVE_AI_API_KEY (direct), YOUTUBE_API_KEY (ytapi). Keys are never printed.
 * Raw outputs + a spend ledger go to scripts/spikes/out/ (gitignored). Hard stop at $3 total.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const OUT = join(HERE, 'out')
const LEDGER = join(OUT, 'ledger.jsonl')
const BUDGET_USD = 3
const SRT_URL = 'https://cdn.cs50.net/2025/fall/lectures/3/lang/en/lecture3.srt'
const L3 = '6Svu_ae5ebk' // packages/db/src/seed/fixtures/l3-lecture.ts
const ytUrl = (id: string): string => `https://www.youtube.com/watch?v=${id}`

function hms(s: string): number {
  return s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0)
}
const fmt = (s: number): string =>
  `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`

interface Clip {
  readonly key: string
  readonly startS: number
  readonly endS: number
}
/** Two clips inside the fixture's core window 1:12:30–1:57:30, one from the lecture's start. */
const CLIPS: readonly Clip[] = [
  { key: 'a', startS: hms('1:12:30'), endS: hms('1:24:30') },
  { key: 'b', startS: hms('1:36:00'), endS: hms('1:48:00') },
  { key: 'c', startS: hms('0:15:00'), endS: hms('0:27:00') },
  { key: 'h', startS: hms('0:05:00'), endS: hms('1:05:00') }, // the 60-minute run (--only h)
]

/**
 * Edge cases (F10.3), found with the Data API on 7 Oct 2026 (search.list → videos.list filters).
 * No unlisted video: search never returns them, and we own none.
 */
const EDGE: readonly { key: string; id: string; note: string }[] = [
  { key: 'noembed', id: '9vM4p9NN0Ts', note: 'Stanford CS229 lecture, embedding disabled' },
  { key: 'age', id: 'rYH3iwiTGOg', note: 'red band trailer, ytAgeRestricted' },
  { key: 'music', id: 't_Kd_G7p6ZQ', note: 'instrumental piano, no speech' },
  { key: 'french', id: '-rcQxFZ0n9k', note: 'Collège de France lecture, audio fr' },
  { key: 'missing', id: 'aaaaaaaaaaa', note: 'nonexistent id' },
]

const out = (line: string): void => void process.stdout.write(`${line}\n`)

// ---------------------------------------------------------------------------- env, budget, SDK

function assertDevKey(): void {
  if (process.env['AI_GATEWAY_KEY_NAME'] !== 'dev')
    throw new Error('AI_GATEWAY_KEY_NAME must be "dev".')
  if (!process.env['AI_GATEWAY_API_KEY'])
    throw new Error('AI_GATEWAY_API_KEY is not set (dev key).')
}

interface LedgerRow {
  readonly at: string
  readonly mode: string
  readonly model: string
  readonly label: string
  readonly costUsd: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly ms: number
}
function spent(): number {
  if (!existsSync(LEDGER)) return 0
  const rows = readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean)
  return rows.reduce((sum, l) => sum + (JSON.parse(l) as LedgerRow).costUsd, 0)
}
function assertBudget(estimateUsd: number): void {
  const s = spent()
  if (s + estimateUsd > BUDGET_USD) {
    throw new Error(
      `budget: spent $${s.toFixed(3)} + est $${estimateUsd} > $${BUDGET_USD}. Stopping.`,
    )
  }
}
function record(row: LedgerRow): void {
  appendFileSync(LEDGER, `${JSON.stringify(row)}\n`)
}

// ponytail: scripts/ has no direct dep on `ai`; resolve it from @lectheo/ai instead of touching
// scripts/package.json (the spike only adds files under scripts/spikes/).
const req = createRequire(join(ROOT, 'packages/ai/package.json'))
const load = async <T>(name: string): Promise<T> =>
  (await import(pathToFileURL(req.resolve(name)).href)) as T
const ai = await load<typeof import('ai')>('ai')
const { gateway } = await load<typeof import('@ai-sdk/gateway')>('@ai-sdk/gateway')

export interface Cue {
  readonly startMs: number
  readonly endMs: number
  readonly text: string
}
const CUES_JSON_SCHEMA = {
  type: 'object',
  properties: {
    cues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startMs: { type: 'integer' },
          endMs: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['startMs', 'endMs', 'text'],
      },
    },
  },
  required: ['cues'],
} as const
const CUES_SCHEMA = ai.jsonSchema<{ cues: Cue[] }>(CUES_JSON_SCHEMA)

/** Variant: timestamps as the "MM:SS" / "H:MM:SS" strings Gemini sees in its video tokens. */
const STAMP_JSON_SCHEMA = {
  type: 'object',
  properties: {
    cues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'string' },
          end: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['start', 'end', 'text'],
      },
    },
  },
  required: ['cues'],
} as const
interface StampCue {
  readonly start: string
  readonly end: string
  readonly text: string
}
/** "H:MM:SS", "MM:SS" or "SS(.s)" → ms. Stamps before the clip are read as clip-relative. */
export function stampCues(cues: readonly StampCue[], clip: Clip): Cue[] {
  const ms = (t: string): number =>
    t
      .trim()
      .split(':')
      .reduce((a, p) => a * 60 + Number(p), 0) * 1000
  const relative = cues.length > 0 && ms(cues[0]!.start) < clip.startS * 1000 - 60_000
  const base = relative ? clip.startS * 1000 : 0
  return cues.map((c) => ({ startMs: base + ms(c.start), endMs: base + ms(c.end), text: c.text }))
}
const stampPrompt = (c: Clip): string =>
  `Transcribe the speech in this video between ${fmt(c.startS)} and ${fmt(c.endS)}, verbatim, in ` +
  'English. Return cues of one or two sentences each (about 5–15 seconds). start/end are the ' +
  'timestamps of the video timeline where the cue is spoken, as H:MM:SS. Cover the whole range ' +
  'without gaps; skip nothing; do not summarise. If there is no speech, return an empty cues array.'

const transcribePrompt = (c: Clip): string =>
  `Transcribe the speech in this video between ${fmt(c.startS)} and ${fmt(c.endS)} (video time), ` +
  'verbatim, in English. Return cues of one or two sentences each (about 5–15 seconds). ' +
  `startMs/endMs are milliseconds from the start of the WHOLE video (so ${c.startS * 1000} is ` +
  `${fmt(c.startS)}). Cover the whole range without gaps; skip nothing; do not summarise. ` +
  'If there is no speech, return an empty cues array.'

interface CallResult {
  readonly ok: boolean
  readonly cues: Cue[] | null
  readonly text: string
  readonly error: string | null
  readonly costUsd: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly ms: number
}
const failed = (error: unknown, ms: number): CallResult => {
  const e = error as { message?: string; statusCode?: number; responseBody?: string }
  const msg = `${e.statusCode ?? ''} ${e.message ?? String(error)} ${e.responseBody ?? ''}`.trim()
  return {
    ok: false,
    cues: null,
    text: '',
    error: msg.slice(0, 1500),
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    ms,
  }
}

interface CallOpts {
  readonly mode: string
  readonly label: string
  readonly model: string
  readonly videoId: string
  readonly prompt: string
  readonly structured: boolean
  readonly clip?: Clip
  readonly maxOutputTokens: number
  readonly estimateUsd: number
  readonly stamps?: boolean
}

function save(opts: CallOpts, row: CallResult): CallResult {
  record({
    at: new Date().toISOString(),
    mode: opts.mode,
    model: opts.model,
    label: opts.label,
    costUsd: row.costUsd,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    ms: row.ms,
  })
  const file = `${opts.mode}-${opts.label}-${opts.model.replace('/', '_')}.json`
  writeFileSync(join(OUT, file), JSON.stringify({ opts, ...row }, null, 2))
  const err = row.error ? ` :: ${row.error.slice(0, 400)}` : ''
  out(
    `${row.ok ? 'OK  ' : 'FAIL'} ${opts.mode}/${opts.label} ${opts.model} ${row.ms}ms in=${row.inputTokens} out=${row.outputTokens} $${row.costUsd.toFixed(4)}${err}`,
  )
  return row
}

/**
 * The request shape under test. `videoMetadata` on the file part is Google's clip field; the
 * standard @ai-sdk/google converter drops part-level options, so `probe` checks whether the
 * gateway honours it by comparing billed input tokens.
 */
async function callGateway(opts: CallOpts): Promise<CallResult> {
  assertBudget(opts.estimateUsd)
  const started = Date.now()
  const file = {
    type: 'file' as const,
    data: ytUrl(opts.videoId),
    mediaType: 'video/mp4',
    ...(opts.clip && {
      providerOptions: {
        google: {
          videoMetadata: { startOffset: `${opts.clip.startS}s`, endOffset: `${opts.clip.endS}s` },
        },
      },
    }),
  }
  const base = {
    model: gateway(opts.model),
    messages: [
      { role: 'user' as const, content: [file, { type: 'text' as const, text: opts.prompt }] },
    ],
    providerOptions: { google: { mediaResolution: 'MEDIA_RESOLUTION_LOW' } },
    reasoning: 'none' as const,
    maxOutputTokens: opts.maxOutputTokens,
    maxRetries: 0,
  }
  try {
    const r = opts.structured
      ? await ai.generateText({ ...base, output: ai.Output.object({ schema: CUES_SCHEMA }) })
      : await ai.generateText(base)
    const gw = (r.providerMetadata?.['gateway'] ?? {}) as Record<string, unknown>
    return save(opts, {
      ok: true,
      cues: opts.structured ? (r.output as { cues: Cue[] }).cues : null,
      text: r.text,
      error: null,
      costUsd: Number(gw['cost'] ?? gw['marketCost'] ?? 0),
      inputTokens: r.totalUsage.inputTokens ?? 0,
      outputTokens: r.totalUsage.outputTokens ?? 0,
      ms: Date.now() - started,
    })
  } catch (error) {
    // A failed parse is still billed: keep tokens + the raw text, cost at list price (no cache).
    if (ai.NoObjectGeneratedError.isInstance(error) && error.usage) {
      const p = PRICE[opts.model.replace(/^google\//, '')] ?? { in: 1, out: 5 }
      const inputTokens = error.usage.inputTokens ?? 0
      const outputTokens = error.usage.outputTokens ?? 0
      return save(opts, {
        ...failed(error, Date.now() - started),
        text: error.text ?? '',
        inputTokens,
        outputTokens,
        costUsd: (inputTokens * p.in + outputTokens * p.out) / 1e6,
      })
    }
    return save(opts, failed(error, Date.now() - started))
  }
}

/** Google list prices (USD per 1M tokens, ≤200k context) for the direct branch's cost estimate. */
const PRICE: Record<string, { in: number; out: number }> = {
  'gemini-3.8-flash': { in: 0.75, out: 3.75 },
  'gemini-3.5-flash-lite': { in: 0.3, out: 2.5 },
  'gemini-2.5-flash-lite': { in: 0.1, out: 0.4 },
  'gemini-3.6-flash': { in: 0.75, out: 3.75 },
  'gemini-3.5-flash': { in: 1.5, out: 9 },
}

/** Google's generateContent REST call: the only path that takes per-part `videoMetadata`. */
async function callDirect(opts: CallOpts): Promise<CallResult> {
  const key = process.env['GOOGLE_GENERATIVE_AI_API_KEY']
  if (!key) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is not set')
  assertBudget(opts.estimateUsd)
  const name = opts.model.replace(/^google\//, '')
  const started = Date.now()
  const video: Record<string, unknown> = {
    fileData: { fileUri: ytUrl(opts.videoId), mimeType: 'video/mp4' },
  }
  if (opts.clip)
    video['videoMetadata'] = {
      startOffset: `${opts.clip.startS}s`,
      endOffset: `${opts.clip.endS}s`,
    }
  const body = {
    contents: [{ role: 'user', parts: [video, { text: opts.prompt }] }],
    generationConfig: {
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      maxOutputTokens: opts.maxOutputTokens,
      ...(opts.structured && {
        responseMimeType: 'application/json',
        responseJsonSchema: opts.stamps ? STAMP_JSON_SCHEMA : CUES_JSON_SCHEMA,
      }),
    },
  }
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${name}:generateContent`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      },
    )
    const j = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
      usageMetadata?: {
        promptTokenCount?: number
        candidatesTokenCount?: number
        thoughtsTokenCount?: number
      }
      error?: { message?: string }
    }
    if (!r.ok) throw Object.assign(new Error(j.error?.message ?? 'error'), { statusCode: r.status })
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const inputTokens = j.usageMetadata?.promptTokenCount ?? 0
    const outputTokens =
      (j.usageMetadata?.candidatesTokenCount ?? 0) + (j.usageMetadata?.thoughtsTokenCount ?? 0)
    const price = PRICE[name] ?? { in: 0, out: 0 }
    return save(opts, {
      ok: true,
      cues: !opts.structured
        ? null
        : opts.stamps
          ? stampCues((JSON.parse(text) as { cues: StampCue[] }).cues, opts.clip!)
          : (JSON.parse(text) as { cues: Cue[] }).cues,
      text: opts.structured ? `finishReason=${j.candidates?.[0]?.finishReason}` : text,
      error: null,
      costUsd: (inputTokens * price.in + outputTokens * price.out) / 1e6,
      inputTokens,
      outputTokens,
      ms: Date.now() - started,
    })
  } catch (error) {
    return save(opts, failed(error, Date.now() - started))
  }
}

// ---------------------------------------------------------------------------- scoring

interface Word {
  readonly w: string
  readonly ms: number
}
const SMALL =
  'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty'.split(
    ' ',
  )
const SAME: Record<string, string> = { okay: 'ok', alright: 'all right' }
/** Lowercase, drop punctuation, spell small numbers so "8" and "eight" match. */
export function norm(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d)\s*%/g, '$1 percent')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((t) =>
      /^\d+$/.test(t) && Number(t) <= 20 ? [SMALL[Number(t)]!] : (SAME[t] ?? t).split(' '),
    )
}

export function parseSrt(srt: string): Cue[] {
  const ms = (t: string): number => {
    const [h, m, rest] = t.split(':')
    const [s, frac] = rest!.split(',')
    return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000 + Number(frac)
  }
  return srt
    .replace(/\r/g, '')
    .split(/\n\n+/)
    .flatMap((block) => {
      const lines = block.trim().split('\n')
      const i = lines.findIndex((l) => l.includes('-->'))
      if (i < 0) return []
      const [a, b] = lines[i]!.split('-->').map((x) => x.trim())
      return [{ startMs: ms(a!), endMs: ms(b!), text: lines.slice(i + 1).join(' ') }]
    })
}

/** Words with a time each, interpolated across the cue's span. */
function toWords(cues: readonly Cue[]): Word[] {
  return cues.flatMap((c) => {
    const ws = norm(c.text)
    const step = ws.length > 1 ? (c.endMs - c.startMs) / ws.length : 0
    return ws.map((w, i) => ({ w, ms: Math.round(c.startMs + i * step) }))
  })
}

type Op = 'M' | 'S' | 'D' | 'I' // match, substitute, delete (missing), insert (invented)
/** Word-level Levenshtein with backtrace. O(n·m) memory: fine for ~2–3k-word clips. */
export function align(
  ref: readonly string[],
  hyp: readonly string[],
): { ops: Op[]; pairs: [number, number][] } {
  const n = ref.length
  const m = hyp.length
  const d = new Uint32Array((n + 1) * (m + 1))
  const at = (i: number, j: number): number => i * (m + 1) + j
  for (let i = 0; i <= n; i++) d[at(i, 0)] = i
  for (let j = 0; j <= m; j++) d[at(0, j)] = j
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[at(i - 1, j - 1)]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
      d[at(i, j)] = Math.min(sub, d[at(i - 1, j)]! + 1, d[at(i, j - 1)]! + 1)
    }
  }
  const ops: Op[] = []
  const pairs: [number, number][] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const same = i > 0 && j > 0 && ref[i - 1] === hyp[j - 1]
    if (i > 0 && j > 0 && d[at(i, j)] === d[at(i - 1, j - 1)]! + (same ? 0 : 1)) {
      ops.push(same ? 'M' : 'S')
      if (same) pairs.push([i - 1, j - 1])
      i--
      j--
    } else if (i > 0 && d[at(i, j)] === d[at(i - 1, j)]! + 1) {
      ops.push('D')
      i--
    } else {
      ops.push('I')
      j--
    }
  }
  return { ops: ops.reverse(), pairs: pairs.reverse() }
}

const pct = (xs: readonly number[], p: number): number => {
  if (xs.length === 0) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!
}

export interface Score {
  readonly refWords: number
  readonly hypWords: number
  readonly wer: number
  readonly cues: number
  readonly matchedCues: number
  readonly driftMedianS: number
  readonly driftP95S: number
  readonly within5s: number
  readonly missing: string[]
  readonly invented: string[]
  readonly outOfOrder: number
  readonly outsideClip: number
  /** Signed drift (model − official, s) at the first matched cue of each minute: offset or stretch? */
  readonly trend: string[]
}

/** A run of ≥ RUN consecutive deletions/insertions counts as a missing/invented stretch. */
const RUN = 12

function stretches(ops: readonly Op[], kind: 'D' | 'I', words: readonly Word[]): string[] {
  const res: string[] = []
  let idx = 0 // index into ref words for 'D', hyp words for 'I'
  let runStart = -1
  let runLen = 0
  let gap = 0 // a stray coincidental match ("the", "so") must not split a stretch
  const flush = (): void => {
    if (runLen >= RUN) res.push(`${fmt(words[runStart]!.ms / 1000)} (${runLen} words)`)
    runStart = -1
    runLen = 0
    gap = 0
  }
  for (const o of ops) {
    if (o === kind) {
      if (runStart < 0) runStart = idx
      runLen++
      gap = 0
    } else if (runStart >= 0 && ++gap > 3) flush()
    if (kind === 'D' ? o !== 'I' : o !== 'D') idx++
  }
  flush()
  return res
}

/**
 * Scores model cues against the official cues that start inside the clip. Drift = for each model
 * cue, its first word that aligned to an official word, model time vs official time (both
 * interpolated inside their cue).
 */
export function score(ref: readonly Cue[], hyp: readonly Cue[], clip: Clip): Score {
  const lo = clip.startS * 1000
  const hi = clip.endS * 1000
  const refWords = toWords(ref.filter((c) => c.startMs >= lo && c.startMs < hi))
  const hypWords = toWords(hyp)
  const { ops, pairs } = align(
    refWords.map((w) => w.w),
    hypWords.map((w) => w.w),
  )
  const refOf = new Map(pairs.map(([r, h]) => [h, r]))
  const drifts: number[] = []
  const trend = new Map<number, string>()
  let first = 0
  for (const c of hyp) {
    const len = norm(c.text).length
    for (let k = first; k < first + len; k++) {
      const r = refOf.get(k)
      if (r === undefined) continue
      const signed = (hypWords[k]!.ms - refWords[r]!.ms) / 1000
      drifts.push(Math.abs(signed))
      const minute = Math.floor((refWords[r]!.ms - lo) / 60_000)
      if (!trend.has(minute))
        trend.set(
          minute,
          `${fmt(refWords[r]!.ms / 1000)}:${signed > 0 ? '+' : ''}${signed.toFixed(0)}`,
        )
      break
    }
    first += len
  }
  return {
    refWords: refWords.length,
    hypWords: hypWords.length,
    wer: refWords.length ? ops.filter((o) => o !== 'M').length / refWords.length : NaN,
    cues: hyp.length,
    matchedCues: drifts.length,
    driftMedianS: pct(drifts, 0.5),
    driftP95S: pct(drifts, 0.95),
    within5s: drifts.filter((x) => x <= 5).length / (drifts.length || 1),
    missing: stretches(ops, 'D', refWords),
    invented: stretches(ops, 'I', hypWords),
    outOfOrder: hyp.filter((c, i) => i > 0 && c.startMs < hyp[i - 1]!.startMs).length,
    outsideClip: hyp.filter((c) => c.startMs < lo - 5000 || c.endMs > hi + 5000).length,
    trend: [...trend.values()],
  }
}

async function officialCues(): Promise<Cue[]> {
  const f = join(OUT, 'lecture3.srt')
  if (!existsSync(f)) writeFileSync(f, await (await fetch(SRT_URL)).text())
  return parseSrt(readFileSync(f, 'utf8'))
}

// ---------------------------------------------------------------------------- modes

const PROBE_Q = 'In one sentence: what is the lecturer talking about at 1:15:00?'
const PROBE_CLIP: Clip = { key: 'p', startS: hms('1:14:00'), endS: hms('1:16:00') }

/** Does the gateway take a YouTube URL for this model, and does a part-level clip cut billed tokens? */
async function probe(call: Caller, mode: string, model: string): Promise<void> {
  const base = {
    mode,
    model,
    videoId: L3,
    prompt: PROBE_Q,
    structured: false,
    maxOutputTokens: 300,
  }
  await call({ ...base, label: 'clip', clip: PROBE_CLIP, estimateUsd: 0.6 })
  await call({ ...base, label: 'whole', estimateUsd: 0.6 })
}

type Caller = (opts: CallOpts) => Promise<CallResult>

/** Splits a clip into `chunkS`-second sub-clips (the last one absorbs a short remainder). */
export function subClips(c: Clip, chunkS: number): Clip[] {
  const res: Clip[] = []
  for (let t = c.startS; t < c.endS; t += chunkS) {
    const end = c.endS - (t + chunkS) < chunkS / 2 ? c.endS : t + chunkS
    res.push({ key: `${c.key}${res.length}`, startS: t, endS: end })
    if (end === c.endS) break
  }
  return res
}

/**
 * Gemini's cue times drift roughly linearly inside a request (it paces by speech, not the clock),
 * but the request's true span is known. Map [first cue start, last cue end] onto [clip start,
 * clip end]. ponytail: assumes speech runs to both edges (true for lectures); a long silence at an
 * edge would be smeared across the chunk.
 */
export function rescale(cues: readonly Cue[], clip: Clip): Cue[] {
  if (cues.length < 2) return [...cues]
  const t0 = cues[0]!.startMs
  const t1 = Math.max(...cues.map((c) => c.endMs))
  const lo = Math.max(clip.startS * 1000, Math.min(t0, clip.startS * 1000 + 5000))
  const k = (clip.endS * 1000 - lo) / Math.max(1, t1 - t0)
  const at = (t: number): number => Math.round(lo + (t - t0) * k)
  return cues.map((c) => ({ ...c, startMs: at(c.startMs), endMs: at(c.endMs) }))
}

const MS_PER_WORD = 350 // ≈ 170 wpm lecture pace, only for repairing a mis-stamped cue

/**
 * Stitching rule. Chunks are concatenated in order. Inside a chunk, a cue is trusted when it starts
 * in [chunk start − 1 s, chunk end + 2 s) and not before the previous cue; otherwise (e.g. "1:00:03"
 * written for "0:10:03") it is re-timed right after the previous cue at ~350 ms/word, capped at the
 * chunk end. A chunk's first word that repeats the previous chunk's last word is dropped.
 */
export function stitch(parts: readonly { clip: Clip; cues: readonly Cue[] }[]): Cue[] {
  const kept: Cue[] = []
  for (const { clip, cues } of parts) {
    const lo = clip.startS * 1000
    const hi = clip.endS * 1000
    cues.forEach((cue, i) => {
      const last = kept[kept.length - 1]
      const prevEnd = Math.max(last?.endMs ?? lo, lo)
      const trusted =
        cue.startMs >= lo - 1000 && cue.startMs < hi + 2000 && cue.startMs >= (last?.startMs ?? 0)
      const words = cue.text.trim().split(/\s+/)
      const dupe =
        i === 0 && last !== undefined && norm(words[0] ?? '')[0] === norm(last.text).at(-1)
      const text = dupe ? words.slice(1).join(' ') : cue.text
      if (!text) return
      if (trusted) return void kept.push({ ...cue, text })
      const startMs = Math.min(prevEnd, hi)
      kept.push({ startMs, endMs: Math.min(startMs + words.length * MS_PER_WORD, hi), text })
    })
  }
  return kept
}

async function clips(
  call: Caller,
  mode: string,
  model: string,
  only?: string,
  stamps = false,
  chunkS = 0,
): Promise<void> {
  const chosen = CLIPS.filter((c) => !only || only.split(',').includes(c.key))
  const outMode = chunkS ? `${mode}-chunk${chunkS}` : mode
  const started = Date.now()
  const run = (c: Clip): Promise<CallResult> =>
    call({
      mode: outMode,
      label: c.key,
      model,
      videoId: L3,
      structured: true,
      stamps,
      prompt: stamps ? stampPrompt(c) : transcribePrompt(c),
      clip: c,
      maxOutputTokens: 65_000,
      estimateUsd: chunkS ? 0.02 : 0.15,
    })
  await Promise.all(
    chosen.map(async (c) => {
      if (!chunkS) return run(c)
      const subs = subClips(c, chunkS)
      const results = await Promise.all(subs.map(run))
      const cues = stitch(
        subs.map((clip, i) => ({ clip, cues: rescale(results[i]!.cues ?? [], clip) })),
      )
      const sum = (k: 'costUsd' | 'inputTokens' | 'outputTokens'): number =>
        results.reduce((a, r) => a + r[k], 0)
      const merged: CallResult = {
        ok: results.every((r) => r.ok),
        cues,
        text: `${subs.length} chunks`,
        error: results.find((r) => r.error)?.error ?? null,
        costUsd: sum('costUsd'),
        inputTokens: sum('inputTokens'),
        outputTokens: sum('outputTokens'),
        ms: Math.max(...results.map((r) => r.ms)),
      }
      writeFileSync(
        join(OUT, `${outMode}-${c.key}-${model.replace('/', '_')}.json`),
        JSON.stringify(merged, null, 2),
      )
    }),
  )
  out(
    `wall time, ${chosen.length} clip(s) in parallel: ${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
  await scoreAll(outMode, model)
}

async function scoreAll(mode: string, model: string): Promise<void> {
  const ref = await officialCues()
  for (const c of CLIPS) {
    const f = join(OUT, `${mode}-${c.key}-${model.replace('/', '_')}.json`)
    if (!existsSync(f)) continue
    const raw = JSON.parse(readFileSync(f, 'utf8')) as CallResult
    if (!raw.cues) {
      out(`${mode} ${c.key}: no cues (${raw.error?.slice(0, 200)})`)
      continue
    }
    if (!mode.includes('chunk')) {
      const r = score(ref, rescale(raw.cues, c), c)
      out(
        `${mode} ${c.key} RESCALED WER=${(r.wer * 100).toFixed(1)}% drift p50=${r.driftMedianS}s p95=${r.driftP95S}s ≤5s=${(r.within5s * 100).toFixed(1)}% missing=${JSON.stringify(r.missing)}`,
      )
    }
    const s = score(ref, raw.cues, c)
    writeFileSync(
      join(OUT, `score-${mode}-${c.key}-${model.replace('/', '_')}.json`),
      JSON.stringify(s, null, 2),
    )
    const perHour = (raw.costUsd * 3600) / (c.endS - c.startS)
    out(
      `${mode} ${c.key} ${fmt(c.startS)}–${fmt(c.endS)} WER=${(s.wer * 100).toFixed(1)}% drift p50=${s.driftMedianS}s p95=${s.driftP95S}s ≤5s=${(s.within5s * 100).toFixed(1)}% cues=${s.cues}/${s.matchedCues} words ${s.hypWords}/${s.refWords} order=${s.outOfOrder} outside=${s.outsideClip}`,
    )
    out(`   missing=${JSON.stringify(s.missing)} invented=${JSON.stringify(s.invented)}`)
    out(`   trend ${s.trend.join(' ')}`)
    out(
      `   ${raw.ms}ms in=${raw.inputTokens} out=${raw.outputTokens} $${raw.costUsd.toFixed(4)} → $${perHour.toFixed(3)}/h`,
    )
  }
}

async function oembed(id: string): Promise<string> {
  const r = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(ytUrl(id))}`,
  )
  return r.ok
    ? `200 ${((await r.json()) as { title: string }).title}`
    : `${r.status} ${r.statusText}`
}

async function edge(call: Caller, mode: string, model: string, only?: string): Promise<void> {
  for (const e of EDGE.filter((x) => !only || only.split(',').includes(x.key))) {
    out(`-- ${e.key} ${e.id} (${e.note}) oEmbed: ${await oembed(e.id)}`)
    await call({
      mode,
      label: e.key,
      model,
      videoId: e.id,
      structured: true,
      stamps: true,
      clip: { key: e.key, startS: 0, endS: 120 },
      prompt:
        'Transcribe the speech in the first 2 minutes of this video verbatim, in its original ' +
        'language. start/end are the timestamps of the video timeline where the cue is spoken, ' +
        'as H:MM:SS. If there is no speech, return an empty cues array.',
      maxOutputTokens: 8000,
      estimateUsd: 0.05,
    })
  }
}

async function ytapi(): Promise<void> {
  const key = process.env['YOUTUBE_API_KEY']
  if (!key) return out('ytapi: YOUTUBE_API_KEY not set → needs a key: not tested')
  const ids = [L3, ...EDGE.map((e) => e.id)].join(',')
  const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,status,snippet&id=${ids}`
  const r = await fetch(url, { headers: { 'x-goog-api-key': key } })
  const j = (await r.json()) as { items?: YtItem[]; error?: unknown }
  writeFileSync(join(OUT, 'ytapi.json'), JSON.stringify(j, null, 2))
  if (!r.ok) return out(`ytapi: ${r.status} ${JSON.stringify(j.error).slice(0, 300)}`)
  const found = new Set((j.items ?? []).map((v) => v.id))
  for (const id of ids.split(','))
    if (!found.has(id)) out(`${id} not returned (private, deleted or bad id)`)
  for (const v of j.items ?? []) {
    out(
      `${v.id} duration=${v.contentDetails.duration} embeddable=${v.status.embeddable} privacy=${v.status.privacyStatus} live=${v.snippet.liveBroadcastContent} audioLang=${v.snippet.defaultAudioLanguage ?? '-'} ytRating=${v.contentDetails.contentRating?.ytRating ?? '-'} title=${JSON.stringify(v.snippet.title)}`,
    )
  }
}
interface YtItem {
  readonly id: string
  readonly contentDetails: { duration: string; contentRating?: { ytRating?: string } }
  readonly status: { embeddable: boolean; privacyStatus: string }
  readonly snippet: { title: string; liveBroadcastContent: string; defaultAudioLanguage?: string }
}

/** Rebuilds a chunked run from its saved per-chunk outputs (no AI), e.g. after changing stitch. */
async function restitch(
  outMode: string,
  chunkS: number,
  model: string,
  raw = false,
): Promise<void> {
  for (const c of CLIPS) {
    const subs = subClips(c, chunkS)
    const files = subs.map((sc) =>
      join(OUT, `${outMode}-${sc.key}-${model.replace('/', '_')}.json`),
    )
    if (!files.every(existsSync)) continue
    const results = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as CallResult)
    const fix = (cues: readonly Cue[], clip: Clip): Cue[] => (raw ? [...cues] : rescale(cues, clip))
    const cues = stitch(subs.map((clip, i) => ({ clip, cues: fix(results[i]!.cues ?? [], clip) })))
    const f = join(OUT, `${outMode}-${c.key}-${model.replace('/', '_')}.json`)
    const merged = JSON.parse(readFileSync(f, 'utf8')) as CallResult
    writeFileSync(f, JSON.stringify({ ...merged, cues }, null, 2))
  }
  await scoreAll(outMode, model)
}

/** Scorer check, no AI: official vs itself, and vs a copy shifted +3 s with one minute removed. */
async function selftest(): Promise<void> {
  const ref = await officialCues()
  const clip = CLIPS[0]!
  const inClip = ref.filter((c) => c.startMs >= clip.startS * 1000 && c.startMs < clip.endS * 1000)
  const same = score(ref, inClip, clip)
  if (same.wer !== 0 || same.driftP95S !== 0)
    throw new Error(`self-score not perfect: ${JSON.stringify(same)}`)
  const cut = (clip.startS + 300) * 1000
  const shifted = inClip
    .filter((c) => c.startMs < cut || c.startMs >= cut + 60_000)
    .map((c) => ({ ...c, startMs: c.startMs + 3000, endMs: c.endMs + 3000 }))
  const s = score(ref, shifted, clip)
  if (Math.abs(s.driftMedianS - 3) > 0.01 || s.missing.length !== 1)
    throw new Error(`shift test: ${JSON.stringify(s)}`)
  out(
    `selftest ok: self WER 0; shifted p50=${s.driftMedianS}s missing=${s.missing} WER=${(s.wer * 100).toFixed(1)}%`,
  )
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: 'string', default: 'google/gemini-3.8-flash' },
      only: { type: 'string' },
      direct: { type: 'boolean', default: false },
      stamps: { type: 'boolean', default: false },
      as: { type: 'string' },
      chunk: { type: 'string', default: '0' },
      raw: { type: 'boolean', default: false },
    },
  })
  mkdirSync(OUT, { recursive: true })
  const mode = positionals[0]
  const model = values.model
  if (!['score', 'ytapi', 'selftest', 'restitch'].includes(mode ?? '')) assertDevKey()
  if (mode === 'probe')
    await probe(
      values.direct ? callDirect : callGateway,
      values.direct ? 'probe-direct' : 'probe',
      model,
    )
  else if (mode === 'clips') await clips(callGateway, 'clip', model, values.only)
  else if (mode === 'direct') {
    const mode = values.stamps ? 'direct-stamps' : 'direct'
    await clips(callDirect, mode, model, values.only, values.stamps, Number(values.chunk))
  } else if (mode === 'score')
    await scoreAll(values.as ?? (values.direct ? 'direct' : 'clip'), model)
  else if (mode === 'edge')
    await edge(
      values.direct ? callDirect : callGateway,
      values.direct ? 'edge-direct' : 'edge',
      model,
      values.only,
    )
  else if (mode === 'ytapi') await ytapi()
  else if (mode === 'selftest') await selftest()
  else if (mode === 'restitch')
    await restitch(values.as ?? 'direct-chunk120', Number(values.chunk), model, values.raw)
  else
    out(
      'usage: youtube-transcripts.ts probe|clips|direct|score|edge|ytapi [--model …] [--only a,b] [--direct]',
    )
  out(`spent so far: $${spent().toFixed(4)} of $${BUDGET_USD}`)
}

await main()
