'use client'

import {
  ActivityResponse,
  CourseMapResponse,
  CreateActivityResponse,
  LectureResponse,
  ListCoursesResponse,
  MeResponse,
  NextStepResponse,
  RedirectResponse,
  TranscriptResponse,
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

/** GET /lectures/{id}/transcript (watch-mode side panel). Segments don't change while watching. */
export function useTranscript(lectureId: string | undefined) {
  return useQuery({
    queryKey: [...queryKeys.lecture(lectureId ?? ''), 'transcript'] as const,
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}/transcript`, { schema: TranscriptResponse, signal }),
    enabled: Boolean(lectureId),
    select: (response) => response.segments,
    staleTime: Infinity,
  })
}
