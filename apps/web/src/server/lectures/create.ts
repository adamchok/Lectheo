import {
  youtubeRefusalMessage,
  type LectureMediaJson,
  type LectureResponse,
} from '@lectheo/contracts'
import { courses, eq, lectures, sql } from '@lectheo/db'
import type { z } from 'zod'
import type { Actor } from '../auth'
import { appDb, type DbLike } from '../db'
import { serverEnv } from '../env'
import { ApiError, notFound } from '../errors'
import { loadCourseForWrite } from '../ownership'
import { assertGoogleIntakeOpen, consume, MEDIA_LIMITS, tierOf } from '../quota'
import {
  checkVideo,
  requireYoutubeId,
  youtubeClient,
  type YoutubeClient,
  type YoutubeVideo,
} from '../youtube'
import { toLectureDto } from './read'

/* POST /lectures (API Spec §5, F0.7, F1.5–F1.7, F8.3, F10.2–F10.4). */

const MAX_TITLE = 200

type LectureDto = z.input<typeof LectureResponse>

export interface CreateLectureInput {
  id: string
  courseId: string
  /** Required except for `youtube`, which defaults to the video's title. */
  title?: string
  source: 'import' | 'live' | 'audio' | 'transcript' | 'youtube'
  media?: { localFileName: string; durationMs: number | null }
  youtubeUrl?: string
}

const NO_MARKERS = { lost: 0, important: 0 }
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS

/**
 * Creates a draft lecture. Safe retry: a replay with the same id returns the existing lecture
 * (when the actor owns it; any other existing id is a 404). Consumes the daily `lectures` quota.
 * Live recording (mode C) is not built yet, so `live` is a 404 (Spec §3: hidden, not broken).
 */
export async function createLecture(
  actor: Actor,
  input: CreateLectureInput,
  db: DbLike = appDb(),
  now = new Date(),
  youtube?: YoutubeClient,
): Promise<LectureDto> {
  if (input.source === 'live') throw notFound()
  const existing = await findOwned(db, actor, input.id)
  if (existing !== undefined) return existing

  const course = await loadCourseForWrite(actor, input.courseId, db)
  if (input.source === 'import' && input.media?.durationMs != null) {
    assertDuration(actor, input.media.durationMs)
  }
  const video =
    input.source === 'youtube'
      ? await checkYoutube(actor, input.youtubeUrl ?? '', db, youtube ?? youtubeClient())
      : null
  const title = input.title ?? video?.title.slice(0, MAX_TITLE)
  if (!title) throw new ApiError('validation_failed', 'Add a title.')
  const media: LectureMediaJson | null = video
    ? { youtubeId: video.id, durationMs: video.durationMs }
    : input.source === 'import' && input.media
      ? { localFileName: input.media.localFileName, durationMs: input.media.durationMs }
      : null
  // Insert first, then count quota in the same transaction: a failed insert or a lost
  // double-submit race never spends quota, and a 429 rolls the insert back.
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(lectures)
      .values({
        id: input.id,
        courseId: course.id,
        title,
        // ponytail: max+1 without a lock; two concurrent creates in one course may share a seq.
        seq: sql`(select coalesce(max(l.seq), 0) + 1 from lectures l where l.course_id = ${course.id})`,
        source: input.source,
        status: 'draft',
        media,
        durationMs: media?.durationMs ?? null,
      })
      .onConflictDoNothing({ target: lectures.id })
      .returning()
    if (inserted) await consume(actor, 'lectures', tx as unknown as DbLike, now)
    return inserted
  })
  if (row) return toLectureDto(row, NO_MARKERS)
  // Lost a race with a concurrent request carrying the same id.
  const raced = await findOwned(db, actor, input.id)
  if (raced === undefined) throw notFound()
  return raced
}

/**
 * F10.3–F10.4 on the server (never trust the preview the client saw): the Google spend cap, then
 * every Data API check. Too long for a sample account → 403 like any other source; any other
 * refusal → 422 with the reason in plain words.
 */
async function checkYoutube(
  actor: Actor,
  url: string,
  db: DbLike,
  client: YoutubeClient,
): Promise<YoutubeVideo> {
  await assertGoogleIntakeOpen(db, serverEnv().GOOGLE_AI_BUDGET_USD)
  const video = await client.video(requireYoutubeId(url))
  const reason = checkVideo(video, tierOf(actor))
  if (video && reason === 'too_long') assertDuration(actor, video.durationMs)
  if (!video || reason) {
    const maxMinutes = MEDIA_LIMITS[tierOf(actor)].maxDurationMs / MINUTE_MS
    throw new ApiError(
      'unprocessable_input',
      youtubeRefusalMessage(reason ?? 'not_found', maxMinutes),
      { reason: reason ?? 'not_found' },
    )
  }
  return video
}

/** The existing lecture with this id: the actor's own → its DTO, someone else's → 404. */
async function findOwned(db: DbLike, actor: Actor, id: string): Promise<LectureDto | undefined> {
  const [row] = await db
    .select({ lecture: lectures, ownerId: courses.ownerId, kind: courses.kind })
    .from(lectures)
    .innerJoin(courses, eq(courses.id, lectures.courseId))
    .where(eq(lectures.id, id))
    .limit(1)
  if (!row) return undefined
  if (row.kind !== 'personal' || row.ownerId !== actor.userId) throw notFound()
  return toLectureDto(row.lecture, NO_MARKERS)
}

/**
 * Architecture §9.2: sample ≤ 20 min, Google ≤ 2 h. Over the sample limit but within Google's →
 * 403 `sample_account_restricted`; over every limit → 413 `payload_too_large`.
 */
export function assertDuration(actor: Actor, durationMs: number): void {
  const limit = MEDIA_LIMITS[tierOf(actor)].maxDurationMs
  if (durationMs <= limit) return
  const details = { maxDurationMs: limit, durationMs }
  const googleLimit = MEDIA_LIMITS.google.maxDurationMs
  if (actor.isSample && durationMs <= googleLimit) {
    throw new ApiError(
      'sample_account_restricted',
      `Sample accounts can add lectures up to ${limit / MINUTE_MS} minutes. Sign in with Google for up to ${googleLimit / HOUR_MS} hours.`,
      details,
    )
  }
  throw new ApiError('payload_too_large', `Lectures can be up to ${limit / HOUR_MS} hours long.`, details)
}
