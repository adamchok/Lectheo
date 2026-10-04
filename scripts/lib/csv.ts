import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { REPO_ROOT } from './cache'

/** RFC 4180 field: quoted when it contains a comma, quote or newline. */
export const csvField = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Writes rows (first row = header) to docs/evals/<name>.csv; returns the repo-relative path. */
export function writeEvalCsv(name: string, rows: readonly (readonly unknown[])[]): string {
  const relative = `docs/evals/${name}.csv`
  const path = join(REPO_ROOT, relative)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${rows.map((r) => r.map(csvField).join(',')).join('\n')}\n`)
  return relative
}
