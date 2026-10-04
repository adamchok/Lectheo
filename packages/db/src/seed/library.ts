import {
  AnswerKeyByKind,
  CourseAttributionJson,
  DistractorMeta,
  HintsSecret,
  ItemVerification,
  KeyPoints,
  LectureMediaJson,
  PublicPayloadByKind,
  RubricSecret,
} from '@lectheo/contracts'
import type * as s from '../schema'
import { lecture3Items } from './fixtures/l3-items'
import { lecture3 } from './fixtures/l3-lecture'
import { lecture4Items } from './fixtures/l4-items'
import { lecture4 } from './fixtures/l4-lecture'
import { lecture5Items } from './fixtures/l5-items'
import { lecture5 } from './fixtures/l5-lecture'
import { transferItems } from './fixtures/transfer-items'
import {
  EDGES,
  EXTRA_OCCURRENCES,
  LIBRARY_ATTRIBUTION,
  LIBRARY_COURSE_TITLE,
} from './fixtures/graph'
import type { Clock, FlawFx, ItemFx, LectureFx, McqFx, TransferFx } from './fixtures/types'
import { LIBRARY_COURSE_ID, conceptId, edgeId, itemId, lectureId, type LectureKey } from './ids'

/** Provenance of the dev/demo fixture (the real bank comes from scripts/seed-library.ts). */
export const FIXTURE_PROMPT_VERSION = 'fixture-v1'
export const FIXTURE_MODEL = 'fixture'
/** Fixed so library rows are byte-identical across machines. */
export const FIXTURE_CREATED_AT = new Date('2026-09-28T00:00:00.000Z')
const DEFAULT_SEGMENT_SECONDS = 30
const MAX_SEGMENT_SECONDS = 40

export const LECTURES: readonly LectureFx[] = [lecture3, lecture4, lecture5]
export const ITEMS: readonly ItemFx[] = [
  ...lecture3Items,
  ...lecture4Items,
  ...lecture5Items,
  ...transferItems,
]

export const clockToMs = (clock: Clock): number => {
  const parts = clock.split(':').map(Number)
  if (parts.length < 2 || parts.some((p) => !Number.isInteger(p) || p < 0)) {
    throw new Error(`seed: bad clock "${clock}"`)
  }
  return parts.reduce((acc, p) => acc * 60 + p, 0) * 1000
}

type Insert<T extends { $inferInsert: unknown }> = T['$inferInsert']

export interface LibraryRows {
  course: Insert<typeof s.courses>
  lectures: Insert<typeof s.lectures>[]
  segments: Insert<typeof s.transcriptSegments>[]
  concepts: Insert<typeof s.concepts>[]
  occurrences: Insert<typeof s.conceptOccurrences>[]
  edges: Insert<typeof s.conceptEdges>[]
  items: Insert<typeof s.items>[]
  itemSecrets: Insert<typeof s.itemSecrets>[]
}

/** concept key → the lecture that introduces it. */
export const conceptLecture = (): Map<string, LectureFx> =>
  new Map(LECTURES.flatMap((l) => l.concepts.map((c) => [c.key, l] as const)))

const lectureByKey = (key: LectureKey): LectureFx => {
  const lecture = LECTURES.find((l) => l.key === key)
  if (!lecture) throw new Error(`seed: unknown lecture ${key}`)
  return lecture
}

/** Data Model invariant 2: every citation points at an existing segment of its lecture. */
const assertCites = (lecture: LectureFx, segs: readonly number[], what: string): number[] => {
  if (segs.length === 0) throw new Error(`seed: ${what} cites no segment`)
  const known = new Set(lecture.segments.map((seg) => seg.idx))
  const missing = segs.filter((idx) => !known.has(idx))
  if (missing.length > 0) {
    throw new Error(`seed: ${what} cites missing ${lecture.key} segments ${missing.join(', ')}`)
  }
  return [...segs]
}

const buildLecture = (lecture: LectureFx): Insert<typeof s.lectures> => {
  const media = LectureMediaJson.parse({
    youtubeId: lecture.youtubeId,
    startMs: clockToMs(lecture.start),
    endMs: clockToMs(lecture.end),
    durationMs: clockToMs(lecture.duration),
    fallbackAudioUrl: lecture.fallbackAudioUrl,
  })
  return {
    id: lectureId(lecture.key),
    courseId: LIBRARY_COURSE_ID,
    title: lecture.title,
    seq: lecture.seq,
    source: 'library',
    status: 'ready',
    media,
    hasTimestamps: true,
    durationMs: media.durationMs ?? null,
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
  }
}

const buildSegments = (lecture: LectureFx): Insert<typeof s.transcriptSegments>[] => {
  const windowStart = clockToMs(lecture.start)
  const windowEnd = clockToMs(lecture.end)
  return lecture.segments.map((seg, position) => {
    const dur = seg.dur ?? DEFAULT_SEGMENT_SECONDS
    const startMs = clockToMs(seg.at)
    const endMs = startMs + dur * 1000
    if (seg.idx !== position)
      throw new Error(`seed: ${lecture.key} segment ${seg.idx} out of order`)
    if (dur > MAX_SEGMENT_SECONDS)
      throw new Error(`seed: ${lecture.key} s${seg.idx} longer than 40 s`)
    if (startMs < windowStart || endMs > windowEnd) {
      throw new Error(`seed: ${lecture.key} s${seg.idx} outside the core window`)
    }
    return { lectureId: lectureId(lecture.key), idx: seg.idx, startMs, endMs, text: seg.text }
  })
}

const verification = (solvedAnswer: string | null): ItemVerification =>
  ItemVerification.parse({
    verdict: 'pass',
    solvedAnswer,
    reasons: ['fixture: hand-verified'],
    model: FIXTURE_MODEL,
  })

interface ItemParts {
  publicPayload: unknown
  answerKey: unknown
  solvedAnswer: string | null
  distractorMeta: DistractorMeta | null
  rubric: RubricSecret | null
  hints: HintsSecret | null
  leakKeywords: string[]
}

const mcqParts = (item: McqFx): ItemParts => {
  const options = Object.entries(item.options).map(([id, text]) => ({ id, text }))
  const distractorMeta = Object.fromEntries(
    Object.entries(item.distractors).map(([id, [misconception, whyWrong]]) => [
      id,
      { misconception, whyWrong },
    ]),
  )
  return {
    publicPayload: { stem: item.stem, options },
    answerKey: { correctOptionId: item.correct, explanation: item.explanation },
    solvedAnswer: item.correct,
    distractorMeta: DistractorMeta.parse(distractorMeta),
    rubric: null,
    hints: null,
    leakKeywords: [],
  }
}

const flawParts = (item: FlawFx): ItemParts => ({
  publicPayload: { sentences: item.sentences },
  answerKey: {
    hasFlaw: item.flaw !== null,
    flawSentenceIdx: item.flaw?.idx ?? null,
    flawSummary: item.flaw?.summary ?? null,
    correction: item.flaw?.correction ?? null,
    explanation: item.explanation,
  },
  solvedAnswer: item.flaw ? `flawed:${item.flaw.idx}` : 'correct',
  distractorMeta: null,
  rubric: RubricSecret.parse({
    criteria: [
      {
        id: item.flaw ? 'correction' : 'justification',
        label: item.rubric[0],
        description: item.rubric[1],
        max: 2,
      },
    ],
  }),
  hints: HintsSecret.parse(item.hints),
  leakKeywords: [...item.leak],
})

const transferParts = (item: TransferFx): ItemParts => ({
  publicPayload: { prompt: item.prompt },
  answerKey: { modelSolution: item.modelSolution, explanation: item.explanation },
  solvedAnswer: item.modelSolution,
  distractorMeta: null,
  rubric: RubricSecret.parse({
    criteria: item.rubric.map(([id, label, description]) => ({ id, label, description, max: 2 })),
  }),
  hints: HintsSecret.parse(item.hints),
  leakKeywords: [...item.leak],
})

const itemParts = (item: ItemFx): ItemParts => {
  const parts =
    item.kind === 'diagnostic_mcq'
      ? mcqParts(item)
      : item.kind === 'spot_flaw'
        ? flawParts(item)
        : transferParts(item)
  PublicPayloadByKind[item.kind].parse(parts.publicPayload)
  AnswerKeyByKind[item.kind].parse(parts.answerKey)
  return parts
}

const buildItems = (owners: Map<string, LectureFx>): Pick<LibraryRows, 'items' | 'itemSecrets'> => {
  const items: LibraryRows['items'] = []
  const itemSecrets: LibraryRows['itemSecrets'] = []
  for (const item of ITEMS) {
    const lecture = owners.get(item.concept)
    if (!lecture) throw new Error(`seed: item for unknown concept ${item.concept}`)
    const id = itemId(item.concept, item.kind, item.variant)
    const parts = itemParts(item)
    items.push({
      id,
      conceptId: conceptId(item.concept),
      lectureId: lectureId(lecture.key),
      kind: item.kind,
      variant: item.variant,
      status: 'verified',
      publicPayload: parts.publicPayload,
      segmentIdxs: assertCites(
        lecture,
        item.segs,
        `item ${item.concept}/${item.kind}/${item.variant}`,
      ),
      verification: verification(parts.solvedAnswer),
      promptVersion: FIXTURE_PROMPT_VERSION,
      model: FIXTURE_MODEL,
      createdAt: FIXTURE_CREATED_AT,
    })
    itemSecrets.push({
      itemId: id,
      answerKey: parts.answerKey,
      distractorMeta: parts.distractorMeta,
      rubric: parts.rubric,
      hints: parts.hints,
      leakKeywords: parts.leakKeywords,
    })
  }
  return { items, itemSecrets }
}

const buildGraph = (
  owners: Map<string, LectureFx>,
): Pick<LibraryRows, 'concepts' | 'occurrences' | 'edges'> => {
  const concepts: LibraryRows['concepts'] = []
  const occurrences: LibraryRows['occurrences'] = []
  for (const lecture of LECTURES) {
    for (const c of lecture.concepts) {
      const keyPoints = KeyPoints.parse(
        c.keyPoints.map((kp) => ({
          id: kp.id,
          text: kp.text,
          segmentIdxs: assertCites(lecture, kp.segs, `key point ${c.key}/${kp.id}`),
        })),
      )
      concepts.push({
        id: conceptId(c.key),
        courseId: LIBRARY_COURSE_ID,
        name: c.name,
        canonicalKey: c.key,
        summary: c.summary,
        keyPoints,
        firstLectureId: lectureId(lecture.key),
      })
      occurrences.push({
        conceptId: conceptId(c.key),
        lectureId: lectureId(lecture.key),
        segmentIdxs: assertCites(lecture, c.segs, `occurrence ${c.key}`),
        salience: c.salience,
      })
    }
  }
  for (const extra of EXTRA_OCCURRENCES) {
    if (!owners.has(extra.concept)) throw new Error(`seed: unknown concept ${extra.concept}`)
    occurrences.push({
      conceptId: conceptId(extra.concept),
      lectureId: lectureId(extra.lecture),
      segmentIdxs: assertCites(
        lectureByKey(extra.lecture),
        extra.segs,
        `occurrence ${extra.concept}`,
      ),
      salience: extra.salience,
    })
  }
  const edges = EDGES.map((e) => {
    if (!owners.has(e.from) || !owners.has(e.to)) {
      throw new Error(`seed: edge ${e.from} → ${e.to} uses an unknown concept`)
    }
    return {
      id: edgeId(e.from, e.relation, e.to),
      courseId: LIBRARY_COURSE_ID,
      fromConceptId: conceptId(e.from),
      toConceptId: conceptId(e.to),
      relation: e.relation,
      lectureId: lectureId(e.lecture),
      segmentIdxs: assertCites(lectureByKey(e.lecture), e.segs, `edge ${e.from} → ${e.to}`),
    }
  })
  return { concepts, occurrences, edges }
}

/** Pure: builds (and validates) every library row. Throws on any invalid fixture. */
export function buildLibraryRows(): LibraryRows {
  const owners = conceptLecture()
  return {
    course: {
      id: LIBRARY_COURSE_ID,
      ownerId: null,
      kind: 'library',
      title: LIBRARY_COURSE_TITLE,
      attribution: CourseAttributionJson.parse(LIBRARY_ATTRIBUTION),
      createdAt: FIXTURE_CREATED_AT,
    },
    lectures: LECTURES.map(buildLecture),
    segments: LECTURES.flatMap(buildSegments),
    ...buildGraph(owners),
    ...buildItems(owners),
  }
}
