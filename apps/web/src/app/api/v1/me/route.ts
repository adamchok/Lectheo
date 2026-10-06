import { MeResponse } from '@lectheo/contracts'
import { eq, profiles } from '@lectheo/db'
import { deleteAccount } from '@/server/account/delete'
import { appDb } from '@/server/db'
import { route } from '@/server/http'
import { createSupabaseServerClient } from '@/server/supabase'

export const dynamic = 'force-dynamic'

/** GET /api/v1/me → the account menu (sample label + Reset). */
export const GET = route({ auth: 'required', response: MeResponse }, async ({ actor }) => {
  const [profile] = await appDb()
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, actor.userId))
    .limit(1)
  return {
    id: actor.userId,
    kind: actor.kind,
    displayName: profile?.displayName ?? null,
    isSample: actor.isSample,
  }
})

/** DELETE /api/v1/me → 204: deletes a Google account and everything in it, then signs out. */
export const DELETE = route({ auth: 'required', status: 204 }, async ({ actor }) => {
  await deleteAccount(actor)
  const supabase = await createSupabaseServerClient()
  // Local scope removes the session cookies even when Auth answers that the user is gone.
  await supabase.auth.signOut({ scope: 'local' })
})
