'use client'

import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useStartProcessing } from '@/client/queries'
import { limitMessage } from './upload'

export interface BuildMap {
  start: (lectureId: string) => Promise<void>
  pending: boolean
}

/** Last capture step: POST /process, then the lecture page (the pipeline owns both). */
export function useBuildMap(): BuildMap {
  const router = useRouter()
  const processing = useStartProcessing()
  const start = async (lectureId: string) => {
    try {
      const result = await processing.mutateAsync(lectureId)
      if (result === 'pending') {
        toast.info('Processing will start shortly', {
          description: 'Your lecture is saved. Its concept map will appear on the lecture page.',
        })
      }
      router.push(`/lectures/${lectureId}` as Route)
    } catch (error) {
      toast.error("Couldn't start building the map", { description: limitMessage(error) })
    }
  }
  return { start, pending: processing.isPending }
}
