import { z } from 'zod'
import { Attribution, ClientId, Id, Ms } from '../common'
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
})
export type CourseSummary = z.infer<typeof CourseSummary>
export const ListCoursesResponse = z.object({ data: z.array(CourseSummary) })

export const CreateCourseRequest = z.object({
  id: ClientId,
  title: z.string().trim().min(1).max(120),
})

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

export const NextStepResponse = z.object({
  kind: z.enum(['watch', 'diagnostic', 'activity', 'none']),
  lectureId: Id.optional(),
  conceptId: Id.optional(),
  conceptName: z.string().optional(),
  activityType: ActivityType.optional(),
  reason: z.string(),
})
export type NextStepResponse = z.infer<typeof NextStepResponse>
