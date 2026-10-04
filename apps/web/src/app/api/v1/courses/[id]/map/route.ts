import { CourseMapResponse } from '@lectheo/contracts'
import { z } from 'zod'
import { getCourseMap } from '@/server/courses/map'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** Malformed ids are a 404 (ownership helper), not a 400: no existence leak. */
const Params = z.object({ id: z.string() })

/** GET /api/v1/courses/{id}/map → concepts, edges, layout, this user's markers and mastery. */
export const GET = route(
  { auth: 'required', params: Params, response: CourseMapResponse },
  async ({ actor, params }) => getCourseMap(actor, params.id),
)
