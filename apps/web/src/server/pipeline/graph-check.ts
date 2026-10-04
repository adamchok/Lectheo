import type { ExtractConceptsOutput } from '@lectheo/ai'
import type { Relation } from '@lectheo/contracts'
import { canonicalKey, isDag, validateCitations, type GraphEdge } from '@lectheo/domain'

/*
 * validateGraph rules (Architecture §4.3, F2.7, ADR-006, ADR-012), pure: dedupe extracted concepts
 * against the course by normalised key, check every citation exists, and keep the course's
 * depends_on edges a DAG (Data Model invariant 5).
 */

type Extracted = ExtractConceptsOutput['concepts'][number]

export interface CourseConcept {
  id: string
  canonicalKey: string
  name: string
}

export interface CourseEdge {
  id: string
  fromId: string
  toId: string
  relation: Relation
}

export interface PlannedConcept {
  /** Normalised key (dedupe identity). */
  norm: string
  /** The existing course concept this one reuses, or null for a new concept. */
  existingId: string | null
  concept: Extracted
}

export interface PlannedEdge {
  from: string
  to: string
  relation: Relation
  segmentIdxs: number[]
}

export interface GraphPlan {
  concepts: PlannedConcept[]
  edges: PlannedEdge[]
  /** Edge endpoints that matched neither an extracted nor an existing concept. */
  unknownKeys: string[]
}

/** "Linked Lists", "linked-list" and "linked_lists" are the same concept. */
export const normKey = (key: string): string => canonicalKey(key)

/** Node id used in the plan: the existing concept id, or `new:<norm>`. */
export const nodeId = (c: PlannedConcept): string => c.existingId ?? `new:${c.norm}`

export function planGraph(
  extraction: ExtractConceptsOutput,
  existing: readonly CourseConcept[],
): GraphPlan {
  const existingByNorm = new Map<string, string>()
  for (const c of existing) {
    existingByNorm.set(normKey(c.canonicalKey), c.id)
    if (!existingByNorm.has(normKey(c.name))) existingByNorm.set(normKey(c.name), c.id)
  }

  const byNorm = new Map<string, PlannedConcept>()
  for (const concept of extraction.concepts) {
    const norm = normKey(concept.canonicalKey)
    // Two keys that normalise alike are one concept: the first one listed wins.
    if (byNorm.has(norm)) continue
    const existingId = existingByNorm.get(norm) ?? existingByNorm.get(normKey(concept.name)) ?? null
    byNorm.set(norm, { norm, existingId, concept })
  }

  const resolve = (key: string): string | null => {
    const norm = normKey(key)
    const planned = byNorm.get(norm)
    return planned ? nodeId(planned) : (existingByNorm.get(norm) ?? null)
  }

  const unknownKeys: string[] = []
  const edges = extraction.edges.flatMap((e) => {
    const from = resolve(e.fromKey)
    const to = resolve(e.toKey)
    if (!from) unknownKeys.push(e.fromKey)
    if (!to) unknownKeys.push(e.toKey)
    // Dedupe can fold both ends into one concept; that edge says nothing, so it is dropped.
    return from && to && from !== to
      ? [{ from, to, relation: e.relation, segmentIdxs: e.segmentIdxs }]
      : []
  })
  return { concepts: [...byNorm.values()], edges, unknownKeys }
}

/** depends_on cycle across the whole course (existing edges + this lecture's). */
export function cycleErrors(plan: GraphPlan, courseEdges: readonly CourseEdge[]): string[] {
  const all: GraphEdge[] = [
    ...courseEdges.map((e) => ({ from: e.fromId, to: e.toId, relation: e.relation })),
    ...plan.edges,
  ]
  return isDag(all) ? [] : ['depends_on edges form a cycle; drop the edge that closes it']
}

function citationErrors(idxs: readonly number[], known: ReadonlySet<number>, where: string) {
  const check = validateCitations(idxs, known)
  return [
    ...(check.empty ? [`${where}: cites no segment`] : []),
    ...check.missing.map((i) => `${where}: unknown segment s${i}`),
  ]
}

/** Every reason the plan can't be stored ([] = valid). */
export function graphErrors(
  plan: GraphPlan,
  segmentIdxs: ReadonlySet<number>,
  courseEdges: readonly CourseEdge[],
): string[] {
  const conceptErrors = plan.concepts.flatMap(({ concept: c }) => [
    ...citationErrors(c.segmentIdxs, segmentIdxs, c.canonicalKey),
    ...c.keyPoints.flatMap((k) =>
      citationErrors(k.segmentIdxs, segmentIdxs, `${c.canonicalKey}.${k.id}`),
    ),
  ])
  const edgeErrors = plan.edges.flatMap((e) =>
    citationErrors(e.segmentIdxs, segmentIdxs, `edge ${e.from}→${e.to}`),
  )
  return [
    ...plan.unknownKeys.map((k) => `edge endpoint "${k}" is not a concept`),
    ...conceptErrors,
    ...edgeErrors,
    ...cycleErrors(plan, courseEdges),
  ]
}
