import { RedirectResponse } from '@lectheo/contracts'
import { appDb } from '@/server/db'
import { ApiError } from '@/server/errors'
import { route } from '@/server/http'
import { resetSampleAccount } from '@/server/sample'

export const dynamic = 'force-dynamic'

/** POST /api/v1/session/sample/reset (sample accounts only): delete per-user rows, clone again. */
export const POST = route({ auth: 'required', response: RedirectResponse }, async ({ actor }) => {
  if (!actor.isSample) {
    throw new ApiError('sample_account_restricted', 'Only sample accounts can be reset.')
  }
  await resetSampleAccount(appDb(), actor.userId)
  return { redirect: '/dashboard' }
})
