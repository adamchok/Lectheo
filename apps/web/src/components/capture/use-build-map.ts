'use client'

import { LectureResponse } from '@lectheo/contracts'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { apiFetch, isApiClientError } from '@/client/api'
import { POLLING_LECTURE_STATUSES, useProcessLecture } from '@/client/queries'
import { limitMessage } from './upload'

export interface BuildMap {
  start: (lectureId: string) => Promise<void>
  pending: boolean
}

/** True when a 409 `already_processing` is about this lecture (not another in the course). */
async function isProcessing(lectureId: string): Promise<boolean> {
  const lecture = await apiFetch(`/lectures/${lectureId}`, { schema: LectureResponse })
  return POLLING_LECTURE_STATUSES.includes(lecture.status)
}

/** Last capture step: POST /process, then the lecture page (it polls the progress). */
export function useBuildMap(): BuildMap {
  const router = useRouter()
  const processing = useProcessLecture()
  const start = async (lectureId: string) => {
    try {
      try {
        await processing.mutateAsync({ lectureId })
      } catch (error) {
        const thisLecture =
          isApiClientError(error) &&
          error.code === 'already_processing' &&
          (await isProcessing(lectureId))
        if (!thisLecture) throw error
      }
      router.push(`/lectures/${lectureId}` as Route)
    } catch (error) {
      toast.error("Couldn't start building the map", { description: limitMessage(error) })
    }
  }
  return { start, pending: processing.isPending }
}
