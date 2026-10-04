import { isAiFake, requireEnv } from '../env'

/*
 * AssemblyAI over plain fetch (API Spec §9; ADR-004: only `live` and `audio` sources). Polled,
 * no webhook. Times are media milliseconds. AI_FAKE=1 swaps in a canned client so tests and e2e
 * never call out.
 */

const BASE_URL = 'https://api.assemblyai.com/v2'
const SPEECH_MODEL = 'universal-3-5-pro'
const HTTP_NOT_FOUND = 404

export type SttStatus = 'queued' | 'processing' | 'completed' | 'error'

export interface SttJob {
  status: SttStatus
  error: string | null
  /** Seconds (AssemblyAI reports audio length in seconds). */
  audioDurationS: number | null
  confidence: number | null
}

export interface SttSentence {
  text: string
  startMs: number
  endMs: number
}

export interface SttClient {
  submit(input: { audioUrl: string; keyterms?: readonly string[] }): Promise<{ id: string }>
  get(id: string): Promise<SttJob>
  sentences(id: string): Promise<SttSentence[]>
  /** Deletes the transcript at AssemblyAI; an already-deleted one is fine. */
  remove(id: string): Promise<void>
}

export class SttHttpError extends Error {
  override readonly name = 'SttHttpError'
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

type Fetch = typeof fetch

export function assemblyAiClient(apiKey: string, fetchImpl: Fetch = fetch): SttClient {
  const call = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetchImpl(`${BASE_URL}${path}`, {
      ...init,
      headers: { authorization: apiKey, 'content-type': 'application/json' },
    })
    if (!res.ok) {
      throw new SttHttpError(
        res.status,
        `AssemblyAI ${init.method ?? 'GET'} ${path}: ${res.status}`,
      )
    }
    return (await res.json()) as T
  }

  return {
    async submit({ audioUrl, keyterms = [] }) {
      const body = {
        audio_url: audioUrl,
        speech_model: SPEECH_MODEL,
        ...(keyterms.length > 0 ? { keyterms_prompt: keyterms } : {}),
      }
      const { id } = await call<{ id: string }>('/transcript', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return { id }
    },
    async get(id) {
      const t = await call<{
        status: SttStatus
        error?: string | null
        audio_duration?: number | null
        confidence?: number | null
      }>(`/transcript/${id}`)
      return {
        status: t.status,
        error: t.error ?? null,
        audioDurationS: t.audio_duration ?? null,
        confidence: t.confidence ?? null,
      }
    },
    async sentences(id) {
      const { sentences } = await call<{
        sentences: { text: string; start: number; end: number }[]
      }>(`/transcript/${id}/sentences`)
      return sentences.map((s) => ({ text: s.text, startMs: s.start, endMs: s.end }))
    },
    async remove(id) {
      try {
        await call(`/transcript/${id}`, { method: 'DELETE' })
      } catch (err) {
        if (!(err instanceof SttHttpError && err.status === HTTP_NOT_FOUND)) throw err
      }
    },
  }
}

const FAKE_SENTENCES = [
  'Today we talk about memory and pointers in C.',
  'A pointer is a variable that stores the address of another value.',
  'We get heap memory with malloc, which returns the address of the block.',
  'Every malloc needs a matching free, or the program leaks memory.',
  'A linked list chains nodes together, each node pointing to the next.',
  'A hash table spreads keys over buckets using a hash function.',
]
const FAKE_SENTENCE_MS = 30_000

/** Deterministic STT for AI_FAKE=1: completes immediately with a short CS50-style transcript. */
export const fakeSttClient: SttClient = {
  submit: async () => ({ id: 'fake-stt-job' }),
  get: async () => ({
    status: 'completed',
    error: null,
    audioDurationS: (FAKE_SENTENCES.length * FAKE_SENTENCE_MS) / 1000,
    confidence: 0.95,
  }),
  sentences: async () =>
    FAKE_SENTENCES.map((text, i) => ({
      text,
      startMs: i * FAKE_SENTENCE_MS,
      endMs: (i + 1) * FAKE_SENTENCE_MS,
    })),
  remove: async () => {},
}

export function sttClient(): SttClient {
  return isAiFake() ? fakeSttClient : assemblyAiClient(requireEnv('ASSEMBLYAI_API_KEY'))
}
