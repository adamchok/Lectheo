'use client'

import { type ActivityResponse, SubmitResponse } from '@lectheo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/client/api'
import { queryKeys } from '@/client/queries'

/* Stump the AI submit (API Spec §7). Keeps the cached GET /activities/{id} in step. */

export interface StumpDraft {
  question: string
  answerKey: string
}

export function useSubmitStump(activityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: StumpDraft) =>
      apiFetch(`/activities/${activityId}/submit`, {
        body: { question: draft.question.trim(), answerKey: draft.answerKey.trim() },
        schema: SubmitResponse,
      }),
    onSuccess: (res) =>
      queryClient.setQueryData<ActivityResponse>(queryKeys.activity(activityId), (old) =>
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
    // An accepted question changes mastery: refresh the activity and every course view.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(activityId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      ]),
  })
}
