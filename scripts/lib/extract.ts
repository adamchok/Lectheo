import {
  extractConceptsTask,
  runTask,
  type ExtractConceptsInput,
  type ExtractConceptsOutput,
  type TaskContext,
  type TaskDef,
} from '@lectheo/ai'
import { isDag, type Segment } from '@lectheo/domain'
import { toKebab, toSnake, type LecturePlan } from './curriculum'

/*
 * Seed-mode concept extraction (F7.1–F7.2): the pipeline's extract-concepts task on the
 * `reasoner-premium` role (Opus 5.5), constrained to the curriculum's introduced concepts so seed
 * keys and ids stay stable. Earlier lectures' concepts are passed as existing course concepts, so
 * the model can link to them (cross-lecture edges) and report where this lecture revisits them
 * (extra occurrences). The task speaks kebab-case; keys are mapped back to snake_case here.
 */

export interface SeedEdge {
  from: string
  to: string
  relation: ExtractConceptsOutput['edges'][number]['relation']
  /** The lecture whose segments `segs` cite (where the link is stated). */
  lecture: LecturePlan['key']
  segs: number[]
}

export interface Extraction {
  lecture: LecturePlan['key']
  model: string
  promptVersion: string
  concepts: ExtractConceptsOutput['concepts']
  edges: ExtractConceptsOutput['edges']
}

/** Every earlier concept with its name, for prompts and validation. */
export interface PriorConcept {
  key: string
  name: string
}

const COUNT_ERROR = /^concepts: expected/

function seedRules(plan: LecturePlan, prior: readonly PriorConcept[]): string {
  const introduced = plan.concepts.map((c) => `- ${toKebab(c.key)}: ${c.name}`).join('\n')
  const required = plan.requiredEdges
    .map(([from, to]) => `- ${toKebab(from)} depends_on ${toKebab(to)}`)
    .join('\n')
  return [
    'Library mode (pre-generated CS50 course, Product Spec F7):',
    `This lecture introduces exactly these ${plan.concepts.length} concepts. Return every one of`,
    'them with exactly this canonicalKey and do not add other new concepts:',
    introduced,
    prior.length > 0
      ? 'You may also return a concept from the existing course list (same canonicalKey) when this' +
        ' lecture substantially revisits it; cite the segments where it does. Its summary and key' +
        ' points are ignored (they come from the lecture that introduced it).'
      : '',
    'Write each summary and key point about what this lecture actually says, citing the segments',
    'that say it. Key points are what a student must be able to explain in a teach-back (3–5).',
    'Edges: link concepts across the whole course where this lecture states or relies on the',
    'link (F7.2: e.g. arrays → pointers → linked lists → hash tables), including links to existing',
    'concepts; cite the segments of this lecture that support each edge.',
    required ? `These depends_on edges are required:\n${required}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function seedErrors(
  out: ExtractConceptsOutput,
  plan: LecturePlan,
  prior: readonly PriorConcept[],
  priorEdges: readonly SeedEdge[],
): string[] {
  const introduced = new Set(plan.concepts.map((c) => toKebab(c.key)))
  const known = new Set([...introduced, ...prior.map((c) => toKebab(c.key))])
  const got = new Set(out.concepts.map((c) => c.canonicalKey))
  const edges = [
    ...priorEdges,
    ...out.edges.map((e) => ({ from: toSnake(e.fromKey), to: toSnake(e.toKey), ...e })),
  ]
  const hasEdge = (from: string, to: string) =>
    out.edges.some(
      (e) => e.relation === 'depends_on' && e.fromKey === toKebab(from) && e.toKey === toKebab(to),
    )
  return [
    ...[...introduced].filter((k) => !got.has(k)).map((k) => `missing concept "${k}"`),
    ...[...got].filter((k) => !known.has(k)).map((k) => `"${k}" is not in the concept list`),
    ...plan.requiredEdges
      .filter(([from, to]) => !hasEdge(from, to))
      .map(([from, to]) => `missing required edge ${toKebab(from)} depends_on ${toKebab(to)}`),
    ...(isDag(edges) ? [] : ['depends_on edges (with earlier lectures) form a cycle']),
    ...out.concepts
      .filter((c) => introduced.has(c.canonicalKey))
      .filter((c) => c.keyPoints.length < 3 || c.keyPoints.length > 5)
      .map((c) => `${c.canonicalKey}: needs 3–5 key points`),
  ]
}

/** extract-concepts on Opus with the library rules appended and checked. */
function seedExtractTask(
  plan: LecturePlan,
  prior: readonly PriorConcept[],
  priorEdges: readonly SeedEdge[],
): TaskDef<ExtractConceptsInput, ExtractConceptsOutput> {
  const base = extractConceptsTask
  return {
    ...base,
    name: 'seed-extract-concepts',
    role: 'reasoner-premium',
    promptVersion: `${base.promptVersion}+seed.1`,
    buildPrompt: (input) => {
      const spec = base.buildPrompt(input)
      return { ...spec, prompt: `${spec.prompt ?? ''}\n\n${seedRules(plan, prior)}` }
    },
    validate: (out, input) => [
      ...(base.validate?.(out, input) ?? []).filter((e) => !COUNT_ERROR.test(e)),
      ...seedErrors(out, plan, prior, priorEdges),
    ],
  }
}

export async function extractLecture(
  plan: LecturePlan,
  segments: readonly Segment[],
  prior: readonly PriorConcept[],
  priorEdges: readonly SeedEdge[],
  ctx: TaskContext,
): Promise<Extraction> {
  const task = seedExtractTask(plan, prior, priorEdges)
  const { output, model } = await runTask(
    task,
    {
      lectureTitle: plan.title,
      segments: segments.map(({ idx, text }) => ({ idx, text })),
      existingConcepts: prior.map((c) => ({ canonicalKey: toKebab(c.key), name: c.name })),
      targetCount: plan.concepts.length,
    },
    ctx,
  )
  return {
    lecture: plan.key,
    model,
    promptVersion: task.promptVersion,
    concepts: output.concepts.map((c) => ({ ...c, canonicalKey: toSnake(c.canonicalKey) })),
    edges: output.edges.map((e) => ({
      ...e,
      fromKey: toSnake(e.fromKey),
      toKey: toSnake(e.toKey),
    })),
  }
}

/** Edges of an extraction in seed keys, deduped against earlier ones (edge ids are per triple). */
export function seedEdges(extraction: Extraction, earlier: readonly SeedEdge[]): SeedEdge[] {
  const seen = new Set(earlier.map((e) => `${e.from}:${e.relation}:${e.to}`))
  const out: SeedEdge[] = []
  for (const e of extraction.edges) {
    const key = `${e.fromKey}:${e.relation}:${e.toKey}`
    if (seen.has(key) || e.fromKey === e.toKey) continue
    seen.add(key)
    out.push({
      from: e.fromKey,
      to: e.toKey,
      relation: e.relation,
      lecture: extraction.lecture,
      segs: [...e.segmentIdxs],
    })
  }
  return out
}
