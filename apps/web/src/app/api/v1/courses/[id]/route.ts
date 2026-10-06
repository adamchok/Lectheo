import { CourseSummary, PatchCourseRequest } from '@lectheo/contracts'
import { z } from 'zod'
import { deleteCourse, renameCourse } from '@/server/courses/write'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

const Params = z.object({ id: z.string() })

/** PATCH /api/v1/courses/{id} `{ title }` → the course summary (owner only; library → 404). */
export const PATCH = route(
  { auth: 'required', params: Params, body: PatchCourseRequest, response: CourseSummary },
  async ({ actor, params, body }) => renameCourse(actor, params.id, body.title),
)

/** DELETE /api/v1/courses/{id} → 204; every lecture as DELETE /lectures/{id}, then the course. */
export const DELETE = route(
  { auth: 'required', params: Params, status: 204 },
  async ({ actor, params }) => deleteCourse(actor, params.id),
)
