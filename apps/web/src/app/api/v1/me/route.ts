import { MeResponse } from '@lectheo/contracts'
import { eq, profiles } from '@lectheo/db'
import { appDb } from '@/server/db'
import { route } from '@/server/http'

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
