'use client'

import {
  ActivityResponse,
  AnswerResponse,
  ConfidenceResponse,
  DiagnosticResultsResponse,
  DiagnosticSessionResponse,
  StartDiagnosticResponse,
  type ConfidenceLevel,
  CourseMapResponse,
  CreateActivityResponse,
  LectureResponse,
  ListCoursesResponse,
  MeResponse,
  NextStepResponse,
  RedirectResponse,
  type ActivityType,
  type LectureStatus,
} from '@lectheo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from './api'
import { newId } from './ids'

/** Query-key factory. Feature teams: add keys here so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  courses: ['courses'] as const,
  courseMap: (courseId: string) => ['courses', courseId, 'map'] as const,
  nextStep: (courseId: string) => ['courses', courseId, 'next'] as const,
  lecture: (lectureId: string) => ['lectures', lectureId] as const,
  activity: (activityId: string) => ['activities', activityId] as const,
  diagnosticStart: (lectureId: string) => ['lectures', lectureId, 'diagnostic'] as const,
  diagnostic: (sessionId: string) => ['diagnostic', sessionId] as const,
  diagnosticResults: (sessionId: string) => ['diagnostic', sessionId, 'results'] as const,
}

/** Lecture statuses that change on their own; polled every 2 s (API Spec §5). */
export const POLLING_LECTURE_STATUSES: readonly LectureStatus[] = ['processing', 'map_ready']
const LECTURE_POLL_MS = 2_000

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => apiFetch('/me', { schema: MeResponse, signal }),
    staleTime: 5 * 60_000,
  })
}

export function useCourses() {
  return useQuery({
    queryKey: queryKeys.courses,
    queryFn: ({ signal }) => apiFetch('/courses', { schema: ListCoursesResponse, signal }),
    select: (response) => response.data,
  })
}

export function useNextStep(courseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.nextStep(courseId ?? ''),
    queryFn: ({ signal }) =>
      apiFetch(`/courses/${courseId}/next`, { schema: NextStepResponse, signal }),
    enabled: Boolean(courseId),
  })
}

export function useCourseMap(courseId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.courseMap(courseId ?? ''),
    queryFn: ({ signal }) =>
      apiFetch(`/courses/${courseId}/map`, { schema: CourseMapResponse, signal }),
    enabled: Boolean(courseId),
  })
}

export function useLecture(lectureId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.lecture(lectureId ?? ''),
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}`, { schema: LectureResponse, signal }),
    enabled: Boolean(lectureId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && POLLING_LECTURE_STATUSES.includes(status) ? LECTURE_POLL_MS : false
    },
  })
}

export function useResetSample() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiFetch('/session/sample/reset', { method: 'POST', body: {}, schema: RedirectResponse }),
    onSuccess: () => queryClient.clear(),
  })
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/session/sign-out', { method: 'POST', body: {} }),
    onSuccess: () => queryClient.clear(),
  })
}

export function useActivity(activityId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.activity(activityId ?? ''),
    queryFn: ({ signal }) =>
      apiFetch(`/activities/${activityId}`, { schema: ActivityResponse, signal }),
    enabled: Boolean(activityId),
  })
}

/** Starts a practice activity (POST /activities) with a client UUIDv7. */
export function useStartActivity() {
  return useMutation({
    mutationFn: (input: { conceptId: string; type: ActivityType }) =>
      apiFetch('/activities', {
        method: 'POST',
        body: { id: newId(), conceptId: input.conceptId, type: input.type },
        schema: CreateActivityResponse,
      }),
  })
}

/** POST /lectures/{id}/diagnostic: the active session or a new plan (idempotent per lecture). */
export function useStartDiagnostic(lectureId: string) {
  return useQuery({
    queryKey: queryKeys.diagnosticStart(lectureId),
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}/diagnostic`, {
        method: 'POST',
        body: {},
        schema: StartDiagnosticResponse,
        signal,
      }),
    staleTime: Infinity,
    retry: false,
  })
}

export function useDiagnosticSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.diagnostic(sessionId ?? ''),
    queryFn: ({ signal }) =>
      apiFetch(`/diagnostic/${sessionId}`, { schema: DiagnosticSessionResponse, signal }),
    enabled: Boolean(sessionId),
    staleTime: Infinity,
  })
}

/** Records confidence; the only call that returns answer options (F3.3). */
export function useDiagnosticConfidence(sessionId: string) {
  return useMutation({
    mutationFn: (input: { itemId: string; level: ConfidenceLevel }) =>
      apiFetch(`/diagnostic/${sessionId}/items/${input.itemId}/confidence`, {
        method: 'POST',
        body: { level: input.level },
        schema: ConfidenceResponse,
      }),
  })
}

export function useDiagnosticAnswer(sessionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { itemId: string; optionId: string }) =>
      apiFetch(`/diagnostic/${sessionId}/items/${input.itemId}/answer`, {
        method: 'POST',
        body: { optionId: input.optionId },
        schema: AnswerResponse,
      }),
    // Mastery changed: maps and next-step cards recompute on read.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
  })
}

export function useDiagnosticResults(sessionId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.diagnosticResults(sessionId),
    queryFn: ({ signal }) =>
      apiFetch(`/diagnostic/${sessionId}/results`, { schema: DiagnosticResultsResponse, signal }),
    enabled,
  })
}
