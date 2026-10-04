import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { LlmCallEntry, TaskContext } from '@lectheo/ai'

/*
 * Resumable stage cache for the offline seed/eval scripts. Every model output is written to
 * .cache/seed-library/<stage>.json before the next stage runs, so a crash or rerun never pays
 * for the same call twice. Every call is also appended to llm-calls.jsonl (the offline twin of
 * the llm_calls table), which is what the budget guard and the cost report read.
 */

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
export const CACHE_DIR = join(REPO_ROOT, '.cache', 'seed-library')
const LEDGER = join(CACHE_DIR, 'llm-calls.jsonl')

export function cachePath(name: string): string {
  return join(CACHE_DIR, name)
}

export function readCache<T>(name: string): T | null {
  const path = cachePath(name)
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null
}

export function writeCache(name: string, value: unknown): void {
  const path = cachePath(name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/** Returns the cached value, or runs `make` and caches what it returns. */
export async function cached<T>(name: string, make: () => Promise<T>): Promise<T> {
  const hit = readCache<T>(name)
  if (hit !== null) return hit
  const value = await make()
  writeCache(name, value)
  return value
}

export type LedgerEntry = LlmCallEntry & { at: string; run: string }

export function readLedger(): LedgerEntry[] {
  if (!existsSync(LEDGER)) return []
  return readFileSync(LEDGER, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as LedgerEntry)
}

export const ledgerCost = (entries: readonly LedgerEntry[]): number =>
  entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0)

/**
 * Refuses to run against anything but the dev gateway key with real models (Architecture §9.2:
 * dev key for seeding and evals, never prod).
 */
export function assertDevGateway(): void {
  if (process.env['AI_FAKE'] !== '0') throw new Error('Set AI_FAKE=0 (real models).')
  if (process.env['AI_GATEWAY_KEY_NAME'] !== 'dev') {
    throw new Error('AI_GATEWAY_KEY_NAME must be "dev": never seed or eval with the prod key.')
  }
  if (!process.env['AI_GATEWAY_API_KEY']) throw new Error('AI_GATEWAY_API_KEY is not set.')
}

/**
 * Task context for offline runs: logs every call to the ledger under `run` and blocks new calls
 * once the ledger's total for `run` passes `budgetUsd`.
 */
export function scriptContext(run: string, budgetUsd: number, lectureId?: string): TaskContext {
  return {
    ...(lectureId ? { lectureId } : {}),
    fake: false,
    hooks: {
      checkBudget: async () => {
        const spent = ledgerCost(readLedger().filter((e) => e.run === run))
        if (spent >= budgetUsd) {
          throw new Error(`budget: ${run} has spent $${spent.toFixed(2)} of $${budgetUsd}`)
        }
      },
      logCall: async (entry) => {
        mkdirSync(CACHE_DIR, { recursive: true })
        const row: LedgerEntry = { ...entry, at: new Date().toISOString(), run }
        appendFileSync(LEDGER, `${JSON.stringify(row)}\n`)
      },
    },
  }
}

/** Promise.all with at most `limit` in flight; results keep the input order. */
export async function mapLimit<T, R>(
  list: readonly T[],
  limit: number,
  fn: (x: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(list.length)
  let next = 0
  const worker = async () => {
    while (next < list.length) {
      const i = next++
      results[i] = await fn(list[i] as T, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker))
  return results
}

export const chunk = <T>(list: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) =>
    list.slice(i * size, (i + 1) * size),
  )
