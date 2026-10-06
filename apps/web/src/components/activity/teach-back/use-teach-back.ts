'use client'

import { useChat } from '@ai-sdk/react'
import { ErrorEnvelope, SubmitResponse, type ActivityResponse } from '@lectheo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useMemo } from 'react'
import { API_BASE, apiFetch, ApiClientError } from '@/client/api'
import { queryKeys } from '@/client/queries'

export const LOST_THREAD = 'Sam lost the thread — try again.'

/** messageMetadata sent by the server on stream start/finish (teach-back.ts). */
export type TeachBackMessage = UIMessage<{ turnsLeft?: number }>

export const textOf = (m: Pick<UIMessage, 'parts'>): string =>
  m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')

export function toUiMessages(messages: ActivityResponse['messages']): TeachBackMessage[] {
  return messages.map((m, i) => ({
    id: `server-${i}`,
    role: m.role === 'student' ? 'user' : 'assistant',
    parts: [{ type: 'text', text: m.content }],
  }))
}

/** Non-2xx → ApiClientError (the SDK would otherwise throw the raw body as the message). */
const fetchOrThrow: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  if (response.ok) return response
  const envelope = ErrorEnvelope.safeParse(await response.json().catch(() => undefined))
  throw new ApiClientError({
    code: envelope.success ? envelope.data.error.code : 'internal_error',
    status: response.status,
    message: envelope.success ? envelope.data.error.message : LOST_THREAD,
    details: envelope.success ? envelope.data.error.details : undefined,
  })
}

/**
 * useChat against POST /activities/{id}/messages; the body is only `{ text }` (API Spec §1).
 * Each finished turn refreshes the cached GET, so coming back within staleTime keeps the turns.
 */
export function useTeachBackChat(activity: ActivityResponse) {
  const queryClient = useQueryClient()
  const transport = useMemo(
    () =>
      new DefaultChatTransport<TeachBackMessage>({
        api: `${API_BASE}/activities/${activity.id}/messages`,
        credentials: 'same-origin',
        fetch: fetchOrThrow,
        prepareSendMessagesRequest: ({ messages }) => {
          const last = messages.at(-1)
          return { body: { text: last ? textOf(last) : '' } }
        },
      }),
    [activity.id],
  )
  return useChat<TeachBackMessage>({
    id: activity.id,
    messages: toUiMessages(activity.messages),
    transport,
    onFinish: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.activity(activity.id),
        exact: true,
      })
    },
  })
}

const submit = (activityId: string) =>
  apiFetch(`/activities/${activityId}/submit`, { body: {}, schema: SubmitResponse })

/** POST /submit {}; refreshes the activity plus every course view (mastery map, next step). */
export function useSubmitTeachBack(activityId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => submit(activityId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.activity(activityId), exact: true })
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses })
    },
  })
}

/**
 * A closed activity reloaded: the same `{}` submit replays the stored final attempt
 * (submit.ts, ADR-007), which carries the reveal. No new grading happens.
 */
export function useFinalReplay(activityId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...queryKeys.activity(activityId), 'final'],
    queryFn: () => submit(activityId),
    enabled,
    staleTime: Infinity,
  })
}
