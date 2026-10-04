import { LectureResponse, PatchLectureRequest } from '@lectheo/contracts'
import { z } from 'zod'
import { route } from '@/server/http'
import { getLecture } from '@/server/lectures/read'
import { deleteLecture, renameLecture } from '@/server/lectures/write'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** GET /api/v1/lectures/{id} → status, progress, media and this user's marker counts. */
export const GET = route(
  { auth: 'required', params: Params, response: LectureResponse },
  async ({ actor, params }) => getLecture(actor, params.id),
)

/** PATCH /api/v1/lectures/{id} `{ title }` (owner only; library → 404). */
export const PATCH = route(
  { auth: 'required', params: Params, body: PatchLectureRequest, response: LectureResponse },
  async ({ actor, params, body }) => renameLecture(actor, params.id, body.title),
)

/** DELETE /api/v1/lectures/{id} → 204; cascades, drops orphaned concepts and Storage objects. */
export const DELETE = route(
  { auth: 'required', params: Params, status: 204 },
  async ({ actor, params }) => deleteLecture(actor, params.id),
)
