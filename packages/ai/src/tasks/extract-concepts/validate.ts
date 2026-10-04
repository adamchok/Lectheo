import { KeyPoints } from '@lectheo/contracts'
import { citationErrors, schemaErrors, segmentSet } from '../common'
import type { ExtractConceptsInput, ExtractConceptsOutput } from './schema'

const COUNT_SLACK = 2
const MIN_CONCEPTS = 3
const MAX_CONCEPTS = 20
const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function validateExtraction(
  out: ExtractConceptsOutput,
  input: ExtractConceptsInput,
): string[] {
  const known = segmentSet(input.segments)
  const min = Math.max(MIN_CONCEPTS, input.targetCount - COUNT_SLACK)
  const max = Math.min(MAX_CONCEPTS, input.targetCount + COUNT_SLACK)
  const keys = out.concepts.map((c) => c.canonicalKey)
  const allKeys = new Set([...keys, ...input.existingConcepts.map((c) => c.canonicalKey)])

  const count =
    out.concepts.length < min || out.concepts.length > max
      ? [`concepts: expected ${min}..${max}, got ${out.concepts.length}`]
      : []
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i).map((k) => `duplicate key "${k}"`)
  const conceptErrors = out.concepts.flatMap((c) => [
    ...(KEY_PATTERN.test(c.canonicalKey) ? [] : [`${c.canonicalKey}: key must be lower-kebab`]),
    ...(c.salience < 0 || c.salience > 1 ? [`${c.canonicalKey}: salience must be 0..1`] : []),
    ...citationErrors(c.segmentIdxs, known, c.canonicalKey),
    ...schemaErrors(KeyPoints, c.keyPoints, `${c.canonicalKey}.keyPoints`),
    ...c.keyPoints.flatMap((k) =>
      citationErrors(k.segmentIdxs, known, `${c.canonicalKey}.${k.id}`),
    ),
  ])
  const edgeErrors = out.edges.flatMap((e) => {
    const where = `edge ${e.fromKey}→${e.toKey}`
    return [
      ...(e.fromKey === e.toKey ? [`${where}: self-edge`] : []),
      ...(allKeys.has(e.fromKey) && allKeys.has(e.toKey) ? [] : [`${where}: unknown concept`]),
      ...citationErrors(e.segmentIdxs, known, where),
    ]
  })
  return [...count, ...dupes, ...conceptErrors, ...edgeErrors]
}
