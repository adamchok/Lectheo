import { z } from 'zod'
import { Attribution, ClientId, Id, Ms, SourceRef } from '../common'
import {
  ActivityType,
  CourseKind,
  LectureStatus,
  MarkerKind,
  MasteryState,
  Relation,
} from '../enums'

export const MasteryCounts = z.object({
  gray: z.number().int(),
  red: z.number().int(),
  amber: z.number().int(),
  green: z.number().int(),
})

export const CourseSummary = z.object({
  id: Id,
  title: z.string(),
  kind: CourseKind,
  attribution: Attribution.nullable(),
  lectureCount: z.number().int(),
  mastery: MasteryCounts,
  /**
   * The student's latest work in the course (their lectures, marks, sessions, practice), or null.
   * The dashboard opens the course with the latest value (F0.4).
   */
  lastActiveAt: z.iso.datetime().nullable(),
})
export type CourseSummary = z.infer<typeof CourseSummary>
export const ListCoursesResponse = z.object({ data: z.array(CourseSummary) })

export const CreateCourseRequest = z.object({
  id: ClientId,
  title: z.string().trim().min(1).max(120),
})

/** PATCH /courses/{id}: rename an own course. */
export const PatchCourseRequest = CreateCourseRequest.pick({ title: true })

export const MapLecture = z.object({
  id: Id,
  title: z.string(),
  seq: z.number().int(),
  status: LectureStatus,
  hasTimestamps: z.boolean(),
})

export const MapNode = z.object({
  id: Id,
  name: z.string(),
  summary: z.string(),
  lectureIds: z.array(Id),
  mastery: z.object({
    state: MasteryState,
    confidentMistake: z.boolean(),
    reasons: z.array(z.string()),
  }),
  markers: z.object({ lost: z.number().int(), important: z.number().int() }),
  /** This user's markers linked to the concept (node panel: "▶ 12:41" links). */
  moments: z.array(z.object({ id: Id, lectureId: Id, kind: MarkerKind, tMs: Ms })),
  /** Where the lecture teaches it (F2.4): timestamp + excerpt, most salient first, at most 3. */
  sources: z.array(SourceRef),
  position: z.object({ x: z.number(), y: z.number() }).nullable(),
  /** A verified transfer item this user hasn't seen exists (F4b entry point). */
  transferAvailable: z.boolean().optional(),
})
export type MapNode = z.infer<typeof MapNode>

export const MapEdge = z.object({ id: Id, from: Id, to: Id, relation: Relation })
export type MapEdge = z.infer<typeof MapEdge>

export const UnlinkedMarker = z.object({ id: Id, lectureId: Id, kind: MarkerKind, tMs: Ms })

export const CourseMapResponse = z.object({
  course: z.object({
    id: Id,
    title: z.string(),
    kind: CourseKind,
    attribution: Attribution.nullable(),
  }),
  lectures: z.array(MapLecture),
  nodes: z.array(MapNode),
  edges: z.array(MapEdge),
  unlinkedMarkers: z.array(UnlinkedMarker),
})
export type CourseMapResponse = z.infer<typeof CourseMapResponse>

export const NEXT_STEP_KINDS = [
  'processing',
  'watch',
  'diagnostic',
  'activity',
  'add_lecture',
] as const
export const NextStepKind = z.enum(NEXT_STEP_KINDS)
export type NextStepKind = z.infer<typeof NextStepKind>

export const EVIDENCE_KINDS = [
  'marked_lost',
  'marked_important',
  'confident_mistake',
  'wrong',
  'partial',
] as const
export const EvidenceKind = z.enum(EVIDENCE_KINDS)
export type EvidenceKind = z.infer<typeof EvidenceKind>

/** One "Why" line on the next-step card (F0.10): the student's own marks and attempts only. */
export const NextStepEvidence = z.object({
  kind: EvidenceKind,
  text: z.string(),
  /** The lecture moment ("▶ 12:41") when the evidence is a mark. */
  source: z.object({ lectureId: Id, tMs: Ms }).optional(),
})
export type NextStepEvidence = z.infer<typeof NextStepEvidence>

/** "Also worth doing" row (F0.11): ranked concepts 2 and 3. */
export const AlsoWorthDoing = z.object({
  conceptId: Id,
  conceptName: z.string(),
  state: MasteryState,
  confidentMistake: z.boolean(),
  activityType: ActivityType,
  reason: z.string(),
})
export type AlsoWorthDoing = z.infer<typeof AlsoWorthDoing>

/** GET /courses/{id}/next (F0.4, F0.9–F0.12, Architecture §6.3). */
export const NextStepResponse = z.object({
  kind: NextStepKind,
  lectureId: Id.optional(),
  conceptId: Id.optional(),
  conceptName: z.string().optional(),
  activityType: ActivityType.optional(),
  reason: z.string(),
  evidence: z.array(NextStepEvidence).max(2),
  /** Watch: the lecture's length. Diagnostic 3, practice 5. Null for processing and add_lecture. */
  estimateMinutes: z.number().int().positive().nullable(),
  payoff: z.string().nullable(),
  alsoWorthDoing: z.array(AlsoWorthDoing).max(2),
})
export type NextStepResponse = z.infer<typeof NextStepResponse>
