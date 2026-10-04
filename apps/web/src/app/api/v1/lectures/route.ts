import { CreateLectureRequest, LectureResponse } from '@lectheo/contracts'
import { route } from '@/server/http'
import { createLecture } from '@/server/lectures/create'

export const dynamic = 'force-dynamic'

/** POST /api/v1/lectures → 201 draft LectureResponse (replay-safe on the client-generated id). */
export const POST = route(
  { auth: 'required', body: CreateLectureRequest, response: LectureResponse, status: 201 },
  async ({ actor, body }) => createLecture(actor, body),
)
