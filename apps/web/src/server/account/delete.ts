import { courses, eq, lectures, profiles } from '@lectheo/db'
import type { Actor } from '../auth'
import { deleteCourse } from '../courses/write'
import { appDb, type DbLike } from '../db'
import { ApiError } from '../errors'
import { MID_RUN_STATUSES, type RemoveObjects } from '../lectures/write'

/** Injected so tests don't touch Supabase (storage.ts and supabase.ts are `server-only`). */
export interface AccountDeletionDeps {
  removeObjects?: RemoveObjects
  /** Removes everything under the user's Storage prefix; throws when Storage is unavailable. */
  removeUserObjects: (userId: string) => Promise<void>
  /** Deletes the auth user; an already deleted user is not an error. */
  deleteAuthUser: (userId: string) => Promise<void>
}

const defaultDeps: AccountDeletionDeps = {
  removeUserObjects: async (userId) => {
    const { deleteUserObjects } = await import('../storage')
    await deleteUserObjects(userId)
  },
  deleteAuthUser: async (userId) => {
    const { supabaseAdmin } = await import('../supabase')
    const { error } = await supabaseAdmin().auth.admin.deleteUser(userId)
    if (error && error.status !== 404) {
      throw new ApiError(
        'upstream_unavailable',
        "Your data is deleted but your sign-in isn't yet. Please try again.",
      )
    }
  },
}

/**
 * DELETE /me (F0.6, F8.2): every owned course (as DELETE /courses/{id}), the user's Storage
 * objects, then the profile (cascades usage counters and the markers, sessions, activities and
 * attempts left on library content), then the auth user. Each step is idempotent, so a retry
 * after a partial failure finishes the job: until the auth user is gone the session still works,
 * and a retry that finds no profile gets a fresh empty one from getActor().
 * `llm_calls` rows stay: `user_id` has no FK and is kept for budget accounting (Data Model).
 * ponytail: a signed upload URL issued before the deletion (2 h TTL) can still land an object
 * under `{userId}/` after the sweep; nothing references it. Sweep again from the daily cron
 * (prefixes with no profile) if that matters.
 */
export async function deleteAccount(
  actor: Actor,
  db: DbLike = appDb(),
  deps: AccountDeletionDeps = defaultDeps,
): Promise<void> {
  if (actor.kind !== 'google') {
    throw new ApiError(
      'sample_account_restricted',
      actor.isSample
        ? "Sample accounts can't be deleted: they're removed automatically after 24 hours."
        : "The owner account can't be deleted from the app.",
    )
  }
  const owned = await db
    .select({ id: courses.id, status: lectures.status })
    .from(courses)
    .leftJoin(lectures, eq(lectures.courseId, courses.id))
    .where(eq(courses.ownerId, actor.userId))
  // Checked up front so a 409 never leaves the account half-deleted.
  if (owned.some((row) => row.status && MID_RUN_STATUSES.includes(row.status))) {
    throw new ApiError(
      'already_processing',
      'A lecture is still processing. Delete your account once it finishes.',
    )
  }
  const courseIds = [...new Set(owned.map((row) => row.id))]
  for (const id of courseIds) await deleteCourse(actor, id, db, deps.removeObjects)
  await deps.removeUserObjects(actor.userId)
  await db.delete(profiles).where(eq(profiles.id, actor.userId))
  await deps.deleteAuthUser(actor.userId)
}
