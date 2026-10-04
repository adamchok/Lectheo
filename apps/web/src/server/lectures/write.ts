import { LECTURE_STATUSES } from '@lectheo/contracts'
import { and, concepts, eq, inArray, isNotNull, lectureAssets, lectures, sql } from '@lectheo/db'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { invalidState } from '../errors'
import { type Lecture, loadLectureForWrite } from '../ownership'
import { getLecture } from './read'

/* PATCH / DELETE /lectures/{id}. Write ownership: library and other users' lectures → 404. */

type StorageBucket = 'audio' | 'transcripts' | 'assets'
/** Injected so tests don't touch Supabase Storage (storage.ts is `server-only`). */
export type RemoveObjects = (bucket: StorageBucket, paths: string[]) => Promise<void>

const TRANSCRIPT_EXTS = ['vtt', 'srt', 'txt', 'docx'] as const
/** Statuses where the pipeline is still running: delete → 409. */
const MID_RUN_STATUSES: readonly Lecture['status'][] = ['processing', 'map_ready']
const DELETABLE_STATUSES = LECTURE_STATUSES.filter((s) => !MID_RUN_STATUSES.includes(s))

const defaultRemoveObjects: RemoveObjects = async (bucket, paths) => {
  const { deleteObjects } = await import('../storage')
  await deleteObjects(bucket, paths)
}

/** PATCH /lectures/{id} `{ title }` → the updated LectureResponse. */
export async function renameLecture(
  actor: Actor,
  lectureId: string,
  title: string,
  db: DbLike = appDb(),
): ReturnType<typeof getLecture> {
  const { lecture } = await loadLectureForWrite(actor, lectureId, db)
  await db.update(lectures).set({ title }).where(eq(lectures.id, lecture.id))
  return getLecture(actor, lecture.id, db)
}

/**
 * DELETE /lectures/{id} (Data Model invariant 6, F8.2): delete the lecture (FK cascades take
 * segments, markers, occurrences, items, sessions and attempts on its items), then the course's
 * concepts no longer found in any lecture, in one transaction. Storage objects are removed
 * afterwards, best effort: a Storage failure is logged and never fails the request.
 */
export async function deleteLecture(
  actor: Actor,
  lectureId: string,
  db: DbLike = appDb(),
  removeObjects: RemoveObjects = defaultRemoveObjects,
): Promise<void> {
  const { lecture, course } = await loadLectureForWrite(actor, lectureId, db)
  const assetPaths = await db.transaction(async (tx) => {
    const assets = await tx
      .select({ path: lectureAssets.storagePath })
      .from(lectureAssets)
      .where(and(eq(lectureAssets.lectureId, lecture.id), isNotNull(lectureAssets.storagePath)))
    // Guarded: a mid-run lecture would orphan its STT job and fail the workflow on FKs.
    const deleted = await tx
      .delete(lectures)
      .where(and(eq(lectures.id, lecture.id), inArray(lectures.status, DELETABLE_STATUSES)))
      .returning({ id: lectures.id })
    if (deleted.length === 0) {
      throw invalidState('Wait until processing finishes, then delete the lecture.')
    }
    await tx
      .delete(concepts)
      .where(
        and(
          eq(concepts.courseId, course.id),
          sql`not exists (select 1 from concept_occurrences o
            where o.concept_id = "concepts"."id")`,
        ),
      )
    return assets.flatMap((a) => (a.path ? [a.path] : []))
  })
  await cleanupStorage(removeObjects, {
    audio: lecture.audioPath ? [lecture.audioPath] : [],
    transcripts: TRANSCRIPT_EXTS.map((ext) => `${actor.userId}/${lecture.id}.${ext}`),
    assets: assetPaths,
  })
}

async function cleanupStorage(
  removeObjects: RemoveObjects,
  paths: Record<StorageBucket, string[]>,
): Promise<void> {
  const results = await Promise.allSettled(
    (Object.keys(paths) as StorageBucket[]).map((bucket) => removeObjects(bucket, paths[bucket])),
  )
  for (const r of results) {
    if (r.status === 'rejected') {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason)
      console.warn(JSON.stringify({ event: 'storage_cleanup_failed', reason }))
    }
  }
}
