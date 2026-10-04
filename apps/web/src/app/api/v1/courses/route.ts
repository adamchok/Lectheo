import { CourseSummary, CreateCourseRequest, ListCoursesResponse } from '@lectheo/contracts'
import { createCourse } from '@/server/courses/create'
import { listCourseSummaries } from '@/server/courses/summary'
import { appDb } from '@/server/db'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'

/** GET /api/v1/courses → library courses + the user's personal courses, with mastery counts. */
export const GET = route(
  { auth: 'required', response: ListCoursesResponse },
  async ({ actor }) => ({ data: await listCourseSummaries(appDb(), actor.userId) }),
)

/** POST /api/v1/courses → 201 CourseSummary (replay-safe on the client-generated id). */
export const POST = route(
  { auth: 'required', body: CreateCourseRequest, response: CourseSummary, status: 201 },
  async ({ actor, body }) => createCourse(actor, body),
)
