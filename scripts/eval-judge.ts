/**
 * Judge consistency (Architecture §5.4): ~10 student corrections on library spot-the-flaw items,
 * each graded 3 times by the production judge task (judge-correction, GPT-6.1 Sol). Writes
 * docs/evals/judge.csv and prints agreement (target ≥ 95%) and accuracy against the case label (labels in
 * evals/judge-cases.ts were written by Claude; human review pending).
 *
 *   AI_FAKE=0 AI_GATEWAY_KEY_NAME=dev pnpm --filter @lectheo/scripts eval-judge
 *
 * Every run is cached (.cache/seed-library/evals/judge-*), so a rerun only pays for missing runs.
 */
import { judgeCorrectionTask, runTask, type TaskResult } from '@lectheo/ai'
import { ITEMS, type ItemFx } from '@lectheo/db/seed'
import { assertDevGateway, cached, ledgerCost, readLedger, scriptContext } from './lib/cache'
import { writeEvalCsv } from './lib/csv'
import { JUDGE_CASES, type JudgeCase } from './evals/judge-cases'

const RUN = 'eval-judge'
const RUNS_PER_CASE = 3
const BUDGET_USD = 5
const CORRECTION_MAX = 2

type FlawItem = Extract<ItemFx, { kind: 'spot_flaw' }>
type Grade = Pick<TaskResult<{ criteria: { id: string; score: number }[] }>, 'output' | 'model'>

/** Same scaling as apps/web spot-flaw.ts scaleToCorrection: rubric total → 0–2. */
function scaled(criteria: readonly { id: string; score: number }[], item: FlawItem): number {
  const rubric = item.rubric?.criteria ?? []
  const max = rubric.reduce((s, c) => s + c.max, 0)
  const score = rubric.reduce((s, c) => {
    const got = criteria.find((x) => x.id === c.id)?.score ?? 0
    return s + Math.min(Math.max(got, 0), c.max)
  }, 0)
  return max === 0 ? 0 : Math.round((score / max) * CORRECTION_MAX)
}

function findFlawItem(c: JudgeCase): FlawItem {
  const [concept, , variant] = c.item.split('/')
  const item = ITEMS.find(
    (i) => i.concept === concept && i.kind === 'spot_flaw' && i.variant === Number(variant),
  )
  if (!item || item.kind !== 'spot_flaw' || !item.answerKey.hasFlaw || !item.rubric) {
    throw new Error(`${c.item}: not a flawed spot_flaw item with a rubric`)
  }
  return item
}

async function grade(c: JudgeCase, item: FlawItem, run: number, index: number): Promise<Grade> {
  return cached<Grade>(`evals/judge-${index}-run${run}.json`, async () => {
    const { answerKey: key, rubric } = item
    const { output, model } = await runTask(
      judgeCorrectionTask,
      {
        scenarioSentences: item.publicPayload.sentences,
        flawSentenceIdx: key.flawSentenceIdx ?? 0,
        flawSummary: key.flawSummary ?? '',
        correction: key.correction ?? '',
        rubric: rubric ?? { criteria: [] },
        studentCorrection: c.answer,
      },
      scriptContext(RUN, BUDGET_USD),
    )
    return { output, model }
  })
}

async function main(): Promise<void> {
  assertDevGateway()
  const rows: unknown[][] = []
  let agree = 0
  let criterionAgree = 0
  let correct = 0
  for (const [index, c] of JUDGE_CASES.entries()) {
    const item = findFlawItem(c)
    const grades: Grade[] = []
    for (let run = 1; run <= RUNS_PER_CASE; run++) grades.push(await grade(c, item, run, index))
    const scores = grades.map((g) => scaled(g.output.criteria, item))
    const raw = grades.map((g) => JSON.stringify(g.output.criteria.map((x) => [x.id, x.score])))
    const same = new Set(scores).size === 1
    const majority = [...scores].sort()[1] ?? scores[0]
    agree += same ? 1 : 0
    criterionAgree += new Set(raw).size === 1 ? 1 : 0
    correct += majority === c.expected ? 1 : 0
    rows.push([c.item, c.label, c.answer, c.expected, ...scores, same ? 'yes' : 'no', majority])
  }
  const path = writeEvalCsv('judge', [
    ['item', 'case', 'student_correction', 'expected', 'run1', 'run2', 'run3', 'agree', 'majority'],
    ...rows,
  ])
  const n = JUDGE_CASES.length
  const pct = (k: number) => `${((100 * k) / n).toFixed(0)}%`
  const cost = ledgerCost(readLedger().filter((e) => e.run === RUN))
  process.stdout.write(
    `${path}: ${n} cases × ${RUNS_PER_CASE} runs. Score agreement ${agree}/${n} (${pct(agree)}), ` +
      `criterion-level ${criterionAgree}/${n} (${pct(criterionAgree)}), ` +
      `majority = label ${correct}/${n} (${pct(correct)}). Cost $${cost.toFixed(2)}\n`,
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`eval-judge failed: ${error instanceof Error ? error.stack : error}\n`)
  process.exitCode = 1
})
