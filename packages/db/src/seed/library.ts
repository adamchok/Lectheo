import {
  AnswerKeyByKind,
  Chapters,
  ConceptDepth,
  CourseAttributionJson,
  DistractorMeta,
  HintsSecret,
  ItemVerification,
  KeyPoints,
  LectureMediaJson,
  PublicPayloadByKind,
  RubricSecret,
} from '@lectheo/contracts'
import { chapterErrors, toChapterRanges } from '@lectheo/domain'
import type * as s from '../schema'
import { LIBRARY_CHAPTERS } from './fixtures/chapters'
import { LIBRARY_DEPTH } from './fixtures/depth'
import { EDGES, EXTRA_OCCURRENCES } from './fixtures/edges'
import { lecture3Items } from './fixtures/l3-items'
import { lecture3 } from './fixtures/l3-lecture'
import { lecture4Items } from './fixtures/l4-items'
import { lecture4 } from './fixtures/l4-lecture'
import { lecture5Items } from './fixtures/l5-items'
import { lecture5 } from './fixtures/l5-lecture'
import type { Clock, ItemFx, LectureFx } from './fixtures/types'
import { LIBRARY_COURSE_ID, conceptId, edgeId, itemId, lectureId, type LectureKey } from './ids'

/*
 * The CS50x library bank (Product Spec F7). Fixtures are generated offline by
 * scripts/seed-library.ts from the official subtitles and committed, so seeding is deterministic
 * and makes no AI calls (ADR-010).
 */

export const LIBRARY_COURSE_TITLE = 'CS50x 2026'
export const LIBRARY_ATTRIBUTION: CourseAttributionJson = {
  source: 'CS50x 2026 by Harvard University',
  license: 'CC BY-NC-SA 4.0',
  url: 'https://cs50.harvard.edu/x/license/',
  adaptedBy: 'Lectheo',
}
/** Fixed so library rows are byte-identical across machines. */
export const FIXTURE_CREATED_AT = new Date('2026-09-28T00:00:00.000Z')
/** Architecture §4.3: segments are ≤ 40 s (a single longer subtitle cue is the only exception). */
const MAX_SEGMENT_MS = 40_000

export const LECTURES: readonly LectureFx[] = [lecture3, lecture4, lecture5]
export const ITEMS: readonly ItemFx[] = [...lecture3Items, ...lecture4Items, ...lecture5Items]

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

/** F11.6: the fixture's chapters, checked like the pipeline checks them (null when none). */
const buildChapters = (lecture: LectureFx, owners: Map<string, LectureFx>): Chapters | null => {
  const fx = LIBRARY_CHAPTERS[lecture.key]
  if (!fx || fx.length === 0) return null
  const idxs = lecture.segments.map((seg) => seg.idx)
  const starts = fx.map((c) => ({ ...c, startIdx: c.start }))
  const minutes = (clockToMs(lecture.end) - clockToMs(lecture.start)) / 60_000
  const errors = chapterErrors(starts, idxs, minutes, (key) => owners.has(key))
  if (errors.length > 0) throw new Error(`seed: ${lecture.key} chapters: ${errors.join('; ')}`)
  return Chapters.parse(
    toChapterRanges(starts, Math.max(...idxs)).map(
      ({ id, title, summary, startIdx, endIdx, concepts }) => ({
        id,
        title,
        summary,
        startIdx,
        endIdx,
        conceptIds: concepts.map(conceptId),
      }),
    ),
  )
}

const buildLecture = (
  lecture: LectureFx,
  owners: Map<string, LectureFx>,
): Insert<typeof s.lectures> => {
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
    chapters: buildChapters(lecture, owners),
    createdAt: FIXTURE_CREATED_AT,
    updatedAt: FIXTURE_CREATED_AT,
  }
}

const buildSegments = (lecture: LectureFx): Insert<typeof s.transcriptSegments>[] => {
  const windowStart = clockToMs(lecture.start)
  const windowEnd = clockToMs(lecture.end)
  return lecture.segments.map((seg, position) => {
    const where = `${lecture.key} s${seg.idx}`
    if (seg.idx !== position) throw new Error(`seed: ${where} out of order`)
    if (seg.endMs - seg.startMs > MAX_SEGMENT_MS) throw new Error(`seed: ${where} longer than 40 s`)
    if (seg.startMs < windowStart || seg.endMs > windowEnd) {
      throw new Error(`seed: ${where} outside the core window`)
    }
    return { lectureId: lectureId(lecture.key), ...seg }
  })
}

/** Re-validates a generated item against the contracts (ADR-009 shapes) before it is stored. */
const checkItem = (item: ItemFx, where: string): void => {
  PublicPayloadByKind[item.kind].parse(item.publicPayload)
  AnswerKeyByKind[item.kind].parse(item.answerKey)
  if (ItemVerification.parse(item.verification).verdict !== 'pass') {
    throw new Error(`seed: ${where} is not verified`)
  }
  if (item.kind === 'diagnostic_mcq') DistractorMeta.parse(item.distractorMeta)
  else RubricSecret.parse(item.rubric)
  if (item.hints) HintsSecret.parse(item.hints)
}

const buildItems = (owners: Map<string, LectureFx>): Pick<LibraryRows, 'items' | 'itemSecrets'> => {
  const items: LibraryRows['items'] = []
  const itemSecrets: LibraryRows['itemSecrets'] = []
  for (const item of ITEMS) {
    const where = `item ${item.concept}/${item.kind}/${item.variant}`
    const lecture = owners.get(item.concept)
    if (!lecture) throw new Error(`seed: ${where} has an unknown concept`)
    checkItem(item, where)
    const id = itemId(item.concept, item.kind, item.variant)
    items.push({
      id,
      conceptId: conceptId(item.concept),
      lectureId: lectureId(lecture.key),
      kind: item.kind,
      variant: item.variant,
      status: 'verified',
      publicPayload: item.publicPayload,
      segmentIdxs: assertCites(lecture, item.segs, where),
      verification: item.verification,
      promptVersion: item.promptVersion,
      model: item.model,
      createdAt: FIXTURE_CREATED_AT,
    })
    itemSecrets.push({
      itemId: id,
      answerKey: item.answerKey,
      distractorMeta: item.distractorMeta,
      rubric: item.rubric,
      hints: item.hints,
      leakKeywords: item.leakKeywords,
    })
  }
  return { items, itemSecrets }
}

/** F9.15: the fixture's depth, citing segments of the lecture that introduces the concept. */
const buildDepth = (lecture: LectureFx, key: string): ConceptDepth | null => {
  const fx = LIBRARY_DEPTH[key]
  if (!fx) return null
  const depth = ConceptDepth.parse(fx)
  depth.howItWorks.forEach((p, i) => assertCites(lecture, p.cites, `depth ${key}/${i}`))
  return depth
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
        depth: buildDepth(lecture, c.key),
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
    lectures: LECTURES.map((l) => buildLecture(l, owners)),
    segments: LECTURES.flatMap(buildSegments),
    ...buildGraph(owners),
    ...buildItems(owners),
  }
}
