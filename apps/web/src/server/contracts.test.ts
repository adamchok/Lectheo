import * as contracts from '@lectheo/contracts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

/*
 * ADR-009 / Data Model invariant 1: no response schema may carry a 🔒 field.
 * Walks every exported *Response schema recursively (Zod 4 `_zod.def` introspection).
 * `correctOptionId` is allowed: AnswerResponse reveals it after the answer (API Spec §6).
 * Key points stopped being secret when ADR-009 was amended (F9.8), but only the Study brief shows
 * them: everywhere else they stay out, and answer keys, flaws, rubrics, hints and leak keywords
 * stay hidden everywhere, the brief included.
 */
const FORBIDDEN_KEYS = [
  'answerKey',
  'distractorMeta',
  'leakKeywords',
  'rubricSnapshot',
  'keyPoints',
  'hints',
  'flawSentenceIdx',
  'flawSummary',
  'modelSolution',
]

/** The one place each otherwise-forbidden path may appear. */
const ALLOWED_PATHS: Readonly<Record<string, readonly string[]>> = {
  BriefResponse: ['$.concepts[].keyPoints'],
}

interface Def {
  type: string
  shape?: Record<string, z.ZodType>
  element?: z.ZodType
  innerType?: z.ZodType
  options?: z.ZodType[]
  left?: z.ZodType
  right?: z.ZodType
  keyType?: z.ZodType
  valueType?: z.ZodType
  items?: z.ZodType[]
  rest?: z.ZodType | null
  in?: z.ZodType
  out?: z.ZodType
  getter?: () => z.ZodType
}

const defOf = (schema: z.ZodType): Def => (schema as unknown as { _zod: { def: Def } })._zod.def

/** All object keys reachable from a schema, as dotted paths. */
function collectKeys(schema: z.ZodType, path = '$', seen = new Set<z.ZodType>()): string[] {
  if (seen.has(schema)) return []
  seen.add(schema)
  const def = defOf(schema)
  const walk = (child: z.ZodType | null | undefined, sub: string): string[] =>
    child ? collectKeys(child, sub, seen) : []

  switch (def.type) {
    case 'object':
      return Object.entries(def.shape ?? {}).flatMap(([key, child]) => [
        `${path}.${key}`,
        ...walk(child, `${path}.${key}`),
      ])
    case 'array':
      return walk(def.element, `${path}[]`)
    case 'union':
      return (def.options ?? []).flatMap((o, i) => walk(o, `${path}|${i}`))
    case 'intersection':
      return [...walk(def.left, path), ...walk(def.right, path)]
    case 'record':
    case 'map':
      return walk(def.valueType, `${path}{}`)
    case 'tuple':
      return [
        ...(def.items ?? []).flatMap((it, i) => walk(it, `${path}[${i}]`)),
        ...walk(def.rest, path),
      ]
    case 'pipe':
      return [...walk(def.in, path), ...walk(def.out, path)]
    case 'lazy':
      return walk(def.getter?.(), path)
    default:
      // optional, nullable, default, readonly, catch, nonoptional, promise, …
      return walk(def.innerType, path)
  }
}

const leafKey = (p: string) => p.split('.').at(-1) ?? ''

const responseSchemas = Object.entries(contracts as Record<string, unknown>).filter(
  (entry): entry is [string, z.ZodType] =>
    entry[0].endsWith('Response') && entry[1] instanceof z.ZodType,
)

describe('response contracts never expose secret fields', () => {
  it('finds the response schemas', () => {
    const names = responseSchemas.map(([n]) => n)
    expect(names).toEqual(
      expect.arrayContaining([
        'CreateActivityResponse',
        'ActivityResponse',
        'SubmitResponse',
        'AnswerResponse',
        'CourseMapResponse',
        'BriefResponse',
      ]),
    )
  })

  it('the walker sees nested, optional, union and array keys', () => {
    const planted = z.object({
      a: z
        .array(z.discriminatedUnion('t', [z.object({ t: z.literal('x'), answerKey: z.string() })]))
        .optional(),
    })
    expect(collectKeys(planted).map(leafKey)).toContain('answerKey')
  })

  it.each(responseSchemas)('%s has no 🔒 keys', (name, schema) => {
    const allowed = ALLOWED_PATHS[name] ?? []
    const leaks = collectKeys(schema).filter(
      (p) => FORBIDDEN_KEYS.includes(leafKey(p)) && !allowed.includes(p),
    )
    expect(leaks).toEqual([])
  })

  it('the Study brief shows key points (F9.8) and depth (F9.13)', () => {
    expect(collectKeys(contracts.BriefResponse)).toEqual(
      expect.arrayContaining(['$.concepts[].keyPoints', '$.concepts[].depth']),
    )
  })
})
