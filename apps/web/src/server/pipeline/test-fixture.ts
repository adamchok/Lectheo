import { uuidv7 } from '@lectheo/db'
import { createFixture, ID, type Fixture } from '../courses/test-fixtures'

/*
 * Pipeline test data (test-only). Builds on the course fixture: personal course P (owner A)
 * already holds PL1/PL2 with concepts PC1/PC2; each test adds a fresh lecture to it.
 */

export const SEGMENT_MS = 40_000

const LINES = [
  'Today we look at memory in C and how programs use it.',
  'A pointer is a variable that stores the address of another value.',
  'The star operator dereferences a pointer to reach the value it points at.',
  'malloc asks the operating system for a block of heap memory.',
  'It returns the address of that block, or NULL when memory runs out.',
  'Every block from malloc must be returned with free when you are done.',
  'Forgetting to call free leaks memory until the program ends.',
  'Valgrind helps you find leaks and invalid reads in your program.',
  'A linked list strings nodes together, each node pointing to the next.',
  'Inserting at the head of a list only needs a couple of pointer updates.',
  'Hash tables spread keys over buckets with a hash function.',
  'That is all for today; next week we start with Python.',
]

export interface LectureOptions {
  source?: 'transcript' | 'import' | 'audio'
  segments?: number
  audioPath?: string
}

export interface PipelineFixture extends Fixture {
  lectureId: string
}

/** Fixture + one new lecture in course P (status draft). Timed segments unless `segments: 0`. */
export async function createPipelineFixture(opts: LectureOptions = {}): Promise<PipelineFixture> {
  const f = await createFixture()
  const lectureId = uuidv7()
  await addLecture(f, lectureId, opts)
  return { ...f, lectureId }
}

export async function addLecture(
  f: Fixture,
  lectureId: string,
  opts: LectureOptions = {},
): Promise<void> {
  const n = opts.segments ?? LINES.length
  const audio = opts.audioPath ? `'${opts.audioPath}'` : 'NULL'
  const values = LINES.slice(0, n)
    .map(
      (text, i) => `('${lectureId}', ${i}, ${i * SEGMENT_MS}, ${(i + 1) * SEGMENT_MS}, '${text}')`,
    )
    .join(',')
  await f.exec(`
    INSERT INTO lectures (id, course_id, title, seq, source, status, audio_path)
      VALUES ('${lectureId}', '${ID.P}', 'Week 3 · Memory', 3, '${opts.source ?? 'transcript'}',
      'draft', ${audio});
    ${n > 0 ? `INSERT INTO transcript_segments (lecture_id, idx, start_ms, end_ms, text) VALUES ${values};` : ''}
  `)
}

export async function rows<T>(f: Fixture, sql: string): Promise<T[]> {
  return (await f.testDb.$client.query<T>(sql)).rows
}
