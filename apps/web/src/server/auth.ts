import 'server-only'
import { eq, profiles } from '@lectheo/db'
import { appDb, type DbLike } from './db'
import { ApiError } from './errors'
import { createSupabaseServerClient } from './supabase'

/** Kinds that can sign in. `seed` is a template profile and never an actor. */
export type ActorKind = 'google' | 'sample' | 'owner'

export interface Actor {
  userId: string
  kind: ActorKind
  isSample: boolean
}

type Profile = typeof profiles.$inferSelect

/**
 * The signed-in user, or null. The JWT is verified locally with getClaims() (no Auth round trip
 * with asymmetric keys). The profile is created lazily on first use (no DB trigger).
 * An anonymous session without a profile (purged sample account) counts as signed out: sample
 * profiles are created only by POST /session/sample.
 */
export async function getActor(db: DbLike = appDb()): Promise<Actor | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) return null
  const { sub, is_anonymous: isAnonymous, user_metadata: meta, email } = data.claims

  const existing = await findProfile(db, sub)
  if (existing) return toActor(existing)
  if (isAnonymous) return null
  // A deleted account's access token stays valid until it expires (~1 h): before recreating a
  // profile, ask Auth whether the user still exists. The OAuth callback creates the profile, so
  // this round trip only runs for such stale tokens (and the retry after a failed DELETE /me).
  const { data: user, error: userError } = await supabase.auth.getUser()
  if (userError || !user.user) return null
  return toActor(await ensureProfile(db, sub, 'google', displayName(meta, email)))
}

/** Like getActor() but throws 401 `unauthenticated`. */
export async function requireActor(db?: DbLike): Promise<Actor> {
  const actor = await getActor(db)
  if (!actor) throw new ApiError('unauthenticated')
  return actor
}

/** Idempotent profile upsert (ON CONFLICT DO NOTHING), returns the stored row. */
export async function ensureProfile(
  db: DbLike,
  userId: string,
  kind: ActorKind,
  name: string | null,
): Promise<Profile> {
  await db
    .insert(profiles)
    .values({ id: userId, kind, displayName: name })
    .onConflictDoNothing({ target: profiles.id })
  const profile = await findProfile(db, userId)
  if (!profile) throw new Error(`Profile ${userId} missing after upsert`)
  return profile
}

async function findProfile(db: DbLike, userId: string): Promise<Profile | undefined> {
  const [row] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1)
  return row
}

function toActor(profile: Profile): Actor | null {
  if (profile.kind === 'seed') return null
  return { userId: profile.id, kind: profile.kind, isSample: profile.kind === 'sample' }
}

/** Display name from Google user metadata (full_name / name), falling back to the email. */
export function displayName(meta: unknown, email?: string): string | null {
  const m = (meta ?? {}) as Record<string, unknown>
  const name = [m.full_name, m.name].find((v): v is string => typeof v === 'string' && v !== '')
  return name ?? email ?? null
}
