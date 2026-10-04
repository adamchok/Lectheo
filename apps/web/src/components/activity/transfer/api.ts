'use client'

import { SubmitResponse, type ActivityResponse } from '@lectheo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/client/api'
import { queryKeys } from '@/client/queries'

export const ANSWER_MAX = 4000

/** POST …/submit { answer }; mirrors the state machine in the cached GET, then refreshes views. */
export function useSubmitTransfer(activityId: string) {
  const queryClient = useQueryClient()
  const key = queryKeys.activity(activityId)
  return useMutation({
    mutationFn: (answer: string) =>
      apiFetch(`/activities/${activityId}/submit`, {
        body: { answer: answer.trim().slice(0, ANSWER_MAX) },
        schema: SubmitResponse,
      }),
    onSuccess: (res) =>
      queryClient.setQueryData<ActivityResponse>(key, (old) =>
        old
          ? {
              ...old,
              status: res.final ? 'closed' : 'awaiting_retry',
              tries: [
                ...old.tries.filter((t) => t.tryNo !== res.tryNo),
                { tryNo: res.tryNo, outcome: res.outcome, feedback: res.feedback },
              ],
            }
          : old,
      ),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: key }),
        queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      ]),
  })
}
