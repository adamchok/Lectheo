import {
  concepts,
  courses,
  items,
  itemSecrets,
  lectures,
  profiles,
  transcriptSegments,
  uuidv7,
} from '@lectheo/db'
import { createTestDb } from '@lectheo/db/testing'
import type { Actor } from '../auth'
import type { DbLike } from '../db'

/* Tiny inline fixture for the activities tests (test-only; never imported by app code). */

export const ALICE: Actor = {
  userId: '0190b000-0000-7000-8000-000000000001',
  kind: 'sample',
  isSample: true,
}
export const BOB: Actor = {
  userId: '0190b000-0000-7000-8000-000000000002',
  kind: 'sample',
  isSample: true,
}

export const IDS = {
  course: '0190b000-0000-7000-8000-0000000000c1',
  lecture: '0190b000-0000-7000-8000-0000000000a1',
  concept: '0190b000-0000-7000-8000-0000000000d1',
  flawed: '0190b000-0000-7000-8000-0000000000e1',
  noFlaw: '0190b000-0000-7000-8000-0000000000e2',
} as const

export const SECRET_KEYS = [
  'flawSentenceIdx',
  'flawSummary',
  'answerKey',
  'keyPoints',
  'leakKeywords',
  'rubricSnapshot',
  'hints',
] as const

export const FLAWED_SENTENCES = [
  'A hash table maps keys to buckets with a hash function.',
  'Lookup is O(1) on average when keys spread evenly.',
  'Collisions are impossible if the table has more buckets than keys.',
]

export async function seedFixture(): Promise<DbLike> {
  const db = (await createTestDb()) as unknown as DbLike
  await db.insert(profiles).values([
    { id: ALICE.userId, kind: 'sample' },
    { id: BOB.userId, kind: 'sample' },
  ])
  await db.insert(courses).values({ id: IDS.course, kind: 'library', title: 'CS50x' })
  await db
    .insert(lectures)
    .values({ id: IDS.lecture, courseId: IDS.course, title: 'L5', seq: 5, source: 'library' })
  await db.insert(transcriptSegments).values(
    [0, 1, 2, 3].map((idx) => ({
      lectureId: IDS.lecture,
      idx,
      startMs: idx * 10_000,
      endMs: idx * 10_000 + 9_000,
      text: `Segment ${idx}: hash tables trade memory for speed. `.repeat(idx === 2 ? 8 : 1),
    })),
  )
  await db.insert(concepts).values({
    id: IDS.concept,
    courseId: IDS.course,
    name: 'hash tables',
    canonicalKey: 'hash-tables',
    summary: 'A hash table stores key/value pairs in buckets chosen by a hash function.',
    keyPoints: [
      { id: 'k1', text: 'A hash function maps a key to a bucket index.', segmentIdxs: [0] },
      { id: 'k2', text: 'Collisions are handled by chaining or probing.', segmentIdxs: [2] },
    ],
    firstLectureId: IDS.lecture,
  })
  await seedItems(db)
  return db
}

async function seedItems(db: DbLike): Promise<void> {
  const base = {
    conceptId: IDS.concept,
    lectureId: IDS.lecture,
    kind: 'spot_flaw' as const,
    status: 'verified' as const,
    segmentIdxs: [1, 2],
    promptVersion: 'test',
    model: 'fake',
  }
  await db.insert(items).values([
    { ...base, id: IDS.flawed, variant: 1, publicPayload: { sentences: FLAWED_SENTENCES } },
    {
      ...base,
      id: IDS.noFlaw,
      variant: 2,
      publicPayload: {
        sentences: FLAWED_SENTENCES.slice(0, 2).concat('Chaining stores a list per bucket.'),
      },
    },
    // Not verified: must never be served.
    {
      ...base,
      id: uuidv7(),
      variant: 0,
      status: 'draft',
      publicPayload: { sentences: ['a', 'b', 'c'] },
    },
  ])
  const rubric = {
    criteria: [
      { id: 'correction', label: 'Correction is right', description: 'Fixes the claim.', max: 2 },
    ],
  }
  await db.insert(itemSecrets).values([
    {
      itemId: IDS.flawed,
      answerKey: {
        hasFlaw: true,
        flawSentenceIdx: 2,
        flawSummary: 'Collisions can happen at any load factor.',
        correction: 'Collisions are always possible; more buckets only make them less likely.',
        explanation: 'Two keys can hash to the same bucket no matter how many buckets exist.',
      },
      rubric,
      hints: [
        'Think about what a hash function guarantees.',
        'Look at the claim about collisions.',
      ],
      leakKeywords: ['pigeonhole'],
    },
    {
      itemId: IDS.noFlaw,
      answerKey: {
        hasFlaw: false,
        flawSentenceIdx: null,
        flawSummary: null,
        correction: null,
        explanation: 'Every sentence is correct.',
      },
      rubric,
      hints: ['Check each claim.', 'Is anything actually wrong?'],
      leakKeywords: [],
    },
  ])
}

export const newId = (): string => uuidv7()
