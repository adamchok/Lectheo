'use client'

import {
  ActivityResponse,
  AnswerResponse,
  ConfidenceResponse,
  DiagnosticResultsResponse,
  DiagnosticSessionResponse,
  StartDiagnosticResponse,
  type ConfidenceLevel,
  type DiagnosticRound,
  CourseMapResponse,
  CreateActivityResponse,
  LectureResponse,
  ListCoursesResponse,
  MeResponse,
  NextStepResponse,
  ProcessResponse,
  type ReprocessFromStep,
  RedirectResponse,
  TranscriptResponse,
  YoutubePreviewResponse,
  CourseSummary,
  type ActivityType,
  type LectureStatus,
} from '@lectheo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { z } from 'zod'
import { apiFetch } from './api'
import { newId } from './ids'

type ReprocessFrom = z.infer<typeof ReprocessFromStep>

/** Query-key factory. Feature teams: add keys here so invalidation stays consistent. */
export const queryKeys = {
  me: ['me'] as const,
  courses: ['courses'] as const,
  courseMap: (courseId: string) => ['courses', courseId, 'map'] as const,
  nextStep: (courseId: string) => ['courses', courseId, 'next'] as const,
  lecture: (lectureId: string) => ['lectures', lectureId] as const,
  activity: (activityId: string) => ['activities', activityId] as const,
  // Not under ['lectures', id]: a prefix invalidation of the lecture must never re-POST a start.
  diagnosticStart: (lectureId: string, round: DiagnosticRound = 'core') =>
    ['diagnostic-start', lectureId, round] as const,
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
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.lecture(lectureId ?? ''),
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}`, { schema: LectureResponse, signal }),
    enabled: Boolean(lectureId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && POLLING_LECTURE_STATUSES.includes(status) ? LECTURE_POLL_MS : false
    },
  })

  // Processing just finished (ready or failed): the course list, map and transcript are stale.
  const status = query.data?.status
  const courseId = query.data?.courseId
  const lastStatus = useRef(status)
  useEffect(() => {
    const was = lastStatus.current
    lastStatus.current = status
    if (!was || !status || !POLLING_LECTURE_STATUSES.includes(was)) return
    if (POLLING_LECTURE_STATUSES.includes(status)) return
    void queryClient.invalidateQueries({ queryKey: queryKeys.courses, exact: true })
    if (courseId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.courseMap(courseId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.nextStep(courseId) })
    }
    void queryClient.invalidateQueries({
      queryKey: [...queryKeys.lecture(lectureId ?? ''), 'transcript'],
    })
  }, [status, courseId, lectureId, queryClient])

  return query
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
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { conceptId: string; type: ActivityType }) =>
      apiFetch('/activities', {
        method: 'POST',
        body: { id: newId(), conceptId: input.conceptId, type: input.type },
        schema: CreateActivityResponse,
      }),
    // A started activity changes what the next-step card recommends.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
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

/** POST /lectures/{id}/diagnostic: the active session or a new plan (idempotent per lecture). */
export function useStartDiagnostic(lectureId: string, round: DiagnosticRound = 'core') {
  return useQuery({
    queryKey: queryKeys.diagnosticStart(lectureId, round),
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}/diagnostic`, {
        method: 'POST',
        body: { round },
        schema: StartDiagnosticResponse,
        signal,
      }),
    // Re-POSTing mid-run is harmless (it returns the active session), but after the last answer
    // it would plan a new session and swap the results away, so only refetch on remount.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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
    onSuccess: async () => {
      // Resume state and the start plan are now stale; refetch them on the next visit only, so
      // the running flow (and its results screen) isn't swapped out under the student.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.diagnostic(sessionId),
          refetchType: 'none',
        }),
        queryClient.invalidateQueries({ queryKey: ['diagnostic-start'], refetchType: 'none' }),
        // Mastery changed: maps and next-step cards recompute on read.
        queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      ])
    },
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

/** POST /courses with a caller-held UUIDv7, so a retry replays instead of creating twice. */
export function useCreateCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; title: string }) =>
      apiFetch('/courses', { method: 'POST', body: input, schema: CourseSummary }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
  })
}

/** PATCH /courses/{id}: the list and this course's map carry the title. */
export function useRenameCourse(courseId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (title: string) =>
      apiFetch(`/courses/${courseId}`, { method: 'PATCH', body: { title }, schema: CourseSummary }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.courses, exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.courseMap(courseId), exact: true }),
      ]),
  })
}

/** DELETE /courses/{id}. As with lectures, the caller leaves the page; gcTime drops its map. */
export function useDeleteCourse() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (courseId: string) => apiFetch(`/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses, exact: true }),
  })
}

/** DELETE /me: the account is gone, so nothing cached is valid any more. */
export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/me', { method: 'DELETE' }),
    onSuccess: () => queryClient.clear(),
  })
}

export interface CreateLectureInput {
  id: string
  courseId: string
  /** Optional for `youtube` only: it defaults to the video's title. */
  title?: string
  source: 'import' | 'audio' | 'transcript' | 'youtube'
  media?: { localFileName: string; durationMs: number | null }
  youtubeUrl?: string
}

/** GET /youtube/preview?url= (F10.2): the card and verdict for a pasted link. */
export function useYoutubePreview(url: string) {
  return useQuery({
    queryKey: ['youtube-preview', url] as const,
    queryFn: ({ signal }) =>
      apiFetch(`/youtube/preview?url=${encodeURIComponent(url)}`, {
        schema: YoutubePreviewResponse,
        signal,
      }),
    enabled: url.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  })
}

/** POST /lectures (replay-safe on the caller-held id). */
export function useCreateLecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLectureInput) =>
      apiFetch('/lectures', { method: 'POST', body: input, schema: LectureResponse }),
    onSuccess: (lecture) => {
      queryClient.setQueryData(queryKeys.lecture(lecture.id), lecture)
      // Not awaited: the upload shouldn't wait for the course list to refetch.
      void queryClient.invalidateQueries({ queryKey: queryKeys.courses })
    },
  })
}

/** DELETE /lectures/{id} (F8.2). */
export function useDeleteLecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lectureId: string) => apiFetch(`/lectures/${lectureId}`, { method: 'DELETE' }),
    // The caller leaves the page (router.replace) before removing the lecture's queries, so the
    // mounted page never refetches a deleted lecture and flashes a 404.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
  })
}

/** POST /lectures/{id}/process[?from=step]: start or retry processing (pipeline workstream). */
export function useProcessLecture() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ lectureId, from }: { lectureId: string; from?: ReprocessFrom }) =>
      apiFetch(`/lectures/${lectureId}/process${from ? `?from=${from}` : ''}`, {
        method: 'POST',
        schema: ProcessResponse,
      }),
    onSuccess: (_result, { lectureId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.lecture(lectureId) }),
        // Prefix: the course list plus every course's map and next step.
        queryClient.invalidateQueries({ queryKey: queryKeys.courses }),
      ]),
  })
}
