import { v5 } from 'uuid'

/**
 * Stable ids for seed data (ADR-014: seed student rows must stay in step with library item ids).
 * seedId(key) is a UUIDv5 of `key` in a fixed namespace, so re-seeding is idempotent and ids are
 * identical on every machine. Never change SEED_NAMESPACE or an existing key: ids would move.
 */
export const SEED_NAMESPACE = '6f0b6a52-3c1e-5d7a-9b8e-4c2d1a0e5f37'

export const seedId = (key: string): string => v5(key, SEED_NAMESPACE)

/** The template student that clone_sample() copies (profiles.kind = 'seed'). */
export const SEED_STUDENT_ID = '5eed5eed-0000-4000-8000-000000000001'

export const LIBRARY_COURSE_KEY = 'cs50x-2026'
export const LIBRARY_COURSE_ID = seedId(`course:${LIBRARY_COURSE_KEY}`)

export type LectureKey = 'l3' | 'l4' | 'l5'

export const lectureId = (lecture: LectureKey): string =>
  seedId(`lecture:${LIBRARY_COURSE_KEY}:${lecture}`)

export const conceptId = (conceptKey: string): string =>
  seedId(`concept:${LIBRARY_COURSE_KEY}:${conceptKey}`)

export const edgeId = (from: string, relation: string, to: string): string =>
  seedId(`edge:${LIBRARY_COURSE_KEY}:${from}:${relation}:${to}`)

export const itemId = (conceptKey: string, kind: string, variant: number): string =>
  seedId(`item:${LIBRARY_COURSE_KEY}:${conceptKey}:${kind}:${variant}`)

/** Per-user rows of the seed student (markers, sessions, activities, messages, attempts). */
export const studentRowId = (key: string): string => seedId(`student:${SEED_STUDENT_ID}:${key}`)
