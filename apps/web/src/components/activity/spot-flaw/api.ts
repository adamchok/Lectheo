'use client'

import {
  ActivityResponse,
  AuthorReplyResponse,
  ExplanationResponse,
  HintResponse,
  SubmitResponse,
} from '@lectheo/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/client/api'
import { queryKeys } from '@/client/queries'
import { submitBody, type Answer } from './logic'

/* Spot-the-flaw mutations (API Spec §7). Each keeps the cached GET /activities/{id} in step. */

export function useAskAuthor(activityId: string) {
  const queryClient = useQueryClient()
  const key = queryKeys.activity(activityId)
  return useMutation({
    mutationFn: (text: string) =>
      apiFetch(`/activities/${activityId}/messages`, {
        body: { text },
        schema: AuthorReplyResponse,
      }),
    onSuccess: (res, text) => {
      queryClient.setQueryData<ActivityResponse>(key, (old) => {
        if (!old) return old
        const now = new Date().toISOString()
        return {
          ...old,
          turnsUsed: old.turnBudget - res.turnsLeft,
          messages: [
            ...old.messages,
            { role: 'student', content: text, createdAt: now },
            { role: 'persona', content: res.reply, createdAt: now },
          ],
        }
      })
    },
    // A failed reply still uses the turn on the server: resync the count.
    onError: () => queryClient.invalidateQueries({ queryKey: key }),
  })
}

export function useTakeHint(activityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch(`/activities/${activityId}/hints`, { body: {}, schema: HintResponse }),
    onSuccess: (res) =>
      queryClient.setQueryData<ActivityResponse>(queryKeys.activity(activityId), (old) =>
        old ? { ...old, hintsUsed: res.hintsUsed } : old,
      ),
  })
}

export function useSubmitAnswer(activityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (answer: Answer) =>
      apiFetch(`/activities/${activityId}/submit`, {
        body: submitBody(answer),
        schema: SubmitResponse,
      }),
    // Mirror the state machine at once so the form doesn't flash back before the refetch.
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
    // Mastery changed: refresh the activity and every course view (map, next step, cards).
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.activity(activityId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      ]),
  })
}

export function useShowExplanation(activityId: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch(`/activities/${activityId}/explanation`, {
        body: {},
        schema: ExplanationResponse,
      }),
  })
}
