/**
 * Generates the CS50x library bank offline (Product Spec F7, Architecture §4.3/§5.3, ADR-010) and
 * writes it as committed fixtures under packages/db/src/seed/fixtures/. Seeding then stays
 * deterministic and AI-free. Never touches a database.
 *
 *   pnpm --filter @lectheo/scripts seed-library -- [--lectures l3,l4] [--budget 25] [--emit]
 *
 * Env (dev gateway key only): AI_FAKE=0, AI_GATEWAY_KEY_NAME=dev, AI_GATEWAY_API_KEY.
 * Resumable: every stage (segments, extraction, each draft/verify batch) is cached under
 * .cache/seed-library/, so a crash or rerun never pays for a call twice. Delete a cache file to
 * redo that stage. Calls are logged to .cache/seed-library/llm-calls.jsonl (cost report + budget).
 */
import { parseArgs } from 'node:util'
import type { Segment } from '@lectheo/domain'
import { lectureId, type LectureKey } from '@lectheo/db/seed'
import { buildBank, type BankResult } from './lib/bank'
import { assertDevGateway, cached, ledgerCost, readLedger, scriptContext } from './lib/cache'
import { CURRICULUM, type LecturePlan } from './lib/curriculum'
import { emitFixtures, type LectureOutput } from './lib/emit'
import {
  extractLecture,
  seedEdges,
  type Extraction,
  type PriorConcept,
  type SeedEdge,
} from './lib/extract'
import { SLOT_KIND } from './lib/drafts'
import { fixConcept, REVISIONS } from './lib/reviewed'
import { reviseBank } from './lib/revise'
import { windowSegments } from './lib/segments'

const RUN = 'seed'
const DEFAULT_BUDGET_USD = 25

const out = (line: string): void => {
  process.stdout.write(`${line}\n`)
}

interface Stage {
  output: LectureOutput
  bank: BankResult
}

async function runLecture(
  plan: LecturePlan,
  prior: readonly PriorConcept[],
  priorEdges: readonly SeedEdge[],
  budget: number,
): Promise<Stage> {
  const ctx = scriptContext(RUN, budget, lectureId(plan.key))
  const segments = await cached<Segment[]>(`segments-${plan.key}.json`, () => windowSegments(plan))
  const extraction = await cached<Extraction>(`extract-${plan.key}.json`, () =>
    extractLecture(plan, segments, prior, priorEdges, ctx),
  )
  const concepts = plan.concepts.map(({ key, name }) => {
    const c = extraction.concepts.find((x) => x.canonicalKey === key)
    if (!c) throw new Error(`${plan.key}: extraction has no ${key}`)
    return {
      canonicalKey: key,
      name,
      ...fixConcept(
        key,
        c.summary,
        c.keyPoints.map(({ id, text }) => ({ id, text })),
      ),
    }
  })
  const promptSegments = segments.map(({ idx, text }) => ({ idx, text }))
  const bank = await cached<BankResult>(`bank-${plan.key}.json`, () =>
    buildBank(plan.key, promptSegments, concepts, ctx),
  )
  const mine = REVISIONS.filter((r) =>
    concepts.some((c) => r.item.startsWith(`${c.canonicalKey}/`)),
  )
  const revised = await reviseBank(bank.selected, mine, concepts, promptSegments, ctx)
  const filled = (s: BankResult['shortfall'][number]) =>
    revised.results.some(
      (r) => r.verdict === 'pass' && r.item.startsWith(`${s.conceptKey}/${SLOT_KIND[s.slot]}/`),
    )
  const shortfall = bank.shortfall.filter((s) => !filled(s))
  out(
    `${plan.key}: ${segments.length} segments, ${concepts.length} concepts, ` +
      `${extraction.edges.length} edges, ${bank.candidates.length} drafts → ` +
      `${bank.selected.length} selected, ${revised.results.length} revisions ` +
      `(${revised.results.filter((r) => r.verdict === 'fail').length} failed), ` +
      `${revised.selected.length} final, shortfall ${JSON.stringify(shortfall)}`,
  )
  const output = {
    plan,
    segments,
    extraction,
    bank,
    selected: revised.selected,
    shortfall,
    revisions: revised.results,
  }
  return { output, bank }
}

function report(stages: readonly Stage[]): void {
  const ledger = readLedger().filter((e) => e.run === RUN)
  out(`\nCost (dev key, ${ledger.length} calls): $${ledgerCost(ledger).toFixed(2)}`)
  for (const s of stages) {
    const mine = ledger.filter((e) => e.lectureId === lectureId(s.output.plan.key))
    const drafts = s.bank.candidates.length
    const rejected = s.bank.candidates.filter((c) => c.verification.verdict === 'fail').length
    const minutes = mine.reduce((sum, e) => sum + e.latencyMs, 0) / 60_000
    out(
      `  ${s.output.plan.key}: $${ledgerCost(mine).toFixed(2)}, ${mine.length} calls, ` +
        `${minutes.toFixed(1)} model-min, rejected ${rejected}/${drafts} ` +
        `(${((100 * rejected) / Math.max(drafts, 1)).toFixed(0)}%)`,
    )
  }
  const byModel = new Map<string, number>()
  for (const e of ledger) byModel.set(e.model, (byModel.get(e.model) ?? 0) + (e.costUsd ?? 0))
  for (const [model, cost] of byModel) out(`  ${model}: $${cost.toFixed(2)}`)
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      lectures: { type: 'string', default: 'l3,l4,l5' },
      budget: { type: 'string', default: String(DEFAULT_BUDGET_USD) },
      emit: { type: 'boolean', default: false },
    },
  })
  const wanted = new Set(values.lectures.split(',') as LectureKey[])
  const budget = Number(values.budget)
  assertDevGateway()

  const stages: Stage[] = []
  let prior: PriorConcept[] = []
  let edges: SeedEdge[] = []
  // Lectures run in order: each one links to (and dedupes against) the ones before it.
  for (const plan of CURRICULUM) {
    if (!wanted.has(plan.key)) break
    const stage = await runLecture(plan, prior, edges, budget)
    stages.push(stage)
    prior = [...prior, ...plan.concepts]
    edges = [...edges, ...seedEdges(stage.output.extraction, edges)]
  }
  report(stages)
  if (values.emit) {
    if (stages.length !== CURRICULUM.length) throw new Error('--emit needs all three lectures')
    emitFixtures(
      stages.map((s) => s.output),
      edges,
    )
    out('Wrote packages/db/src/seed/fixtures/{l3,l4,l5}-lecture.ts, *-items.ts, edges.ts')
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`seed-library failed: ${error instanceof Error ? error.stack : error}\n`)
  process.exitCode = 1
})
