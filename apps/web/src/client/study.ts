'use client'

import {
  BriefResponse,
  ListMarkersResponse,
  type MarkerBody,
  type MarkerDto,
  type MarkerKind,
} from '@lectheo/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { apiFetch } from './api'
import { newId } from './ids'
import { queryKeys } from './queries'

/* Study mode (F9) and chapter marks (F11): the brief, the student's marks, and mark toggles. */

type Marker = z.infer<typeof MarkerDto>
type Markers = z.infer<typeof ListMarkersResponse>

export const studyKeys = {
  brief: (lectureId: string) => [...queryKeys.lecture(lectureId), 'brief'] as const,
  markers: (lectureId: string) => [...queryKeys.lecture(lectureId), 'markers'] as const,
}

/** GET /lectures/{id}/brief (from map_ready on). */
export function useBrief(lectureId: string, enabled = true) {
  return useQuery({
    queryKey: studyKeys.brief(lectureId),
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}/brief`, { schema: BriefResponse, signal }),
    enabled,
  })
}

/** GET /lectures/{id}/markers: the student's live marks, to show which ones are pressed. */
export function useMarkers(lectureId: string, enabled = true) {
  return useQuery({
    queryKey: studyKeys.markers(lectureId),
    queryFn: ({ signal }) =>
      apiFetch(`/lectures/${lectureId}/markers`, { schema: ListMarkersResponse, signal }),
    enabled,
    select: (response) => response.data,
  })
}

/**
 * What a study mark is on, with the time and concepts the server will give it: a concept mark
 * sits at the concept's first moment, a chapter mark at the chapter's start (API Spec §5).
 */
export type MarkTarget =
  | { conceptId: string; tMs: number }
  | { chapterId: string; tMs: number; conceptIds: readonly string[] }

const targetConcepts = (t: MarkTarget): readonly string[] =>
  'conceptId' in t ? [t.conceptId] : t.conceptIds

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id))

/**
 * The student's study mark of `kind` on the target, if any. ponytail: marks carry no target id,
 * so a mark is matched by time and concepts; a chapter that starts at its only concept's first
 * moment shares its mark with that concept, which is the same mark anyway.
 */
export function findMark(
  markers: readonly Marker[] | undefined,
  kind: MarkerKind,
  target: MarkTarget,
): Marker | undefined {
  return markers?.find(
    (m) =>
      m.capture === 'study' &&
      m.kind === kind &&
      m.tMs === target.tMs &&
      sameSet(m.conceptIds, targetConcepts(target)),
  )
}

interface ToggleVars {
  kind: MarkerKind
  target: MarkTarget
  /** The mark to undo, or undefined to add one. */
  existing: Marker | undefined
  /** Client id for a new mark (ADR-007: a retried POST is a no-op). */
  id: string
}

/**
 * Adds or undoes a study mark, optimistically (Design System §3: marks are the student's own,
 * cheap to reverse and not graded). The error is the caller's to show inline.
 */
export function useToggleMark(lectureId: string, courseId: string) {
  const queryClient = useQueryClient()
  const key = studyKeys.markers(lectureId)
  const mutation = useMutation({
    mutationFn: async ({ kind, target, existing, id }: ToggleVars) => {
      if (existing) {
        await apiFetch(`/lectures/${lectureId}/markers/${existing.id}`, { method: 'DELETE' })
        return
      }
      const body: MarkerBody =
        'conceptId' in target
          ? { id, kind, capture: 'study', conceptId: target.conceptId }
          : { id, kind, capture: 'study', chapterId: target.chapterId }
      await apiFetch(`/lectures/${lectureId}/markers`, { body: { markers: [body] } })
    },
    onMutate: async ({ kind, target, existing, id }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<Markers>(key)
      const data = before?.data ?? []
      const next = existing
        ? data.filter((m) => m.id !== existing.id)
        : [
            ...data,
            {
              id,
              kind,
              tMs: target.tMs,
              capture: 'study' as const,
              conceptIds: [...targetConcepts(target)],
            },
          ]
      queryClient.setQueryData<Markers>(key, { data: next })
      return { before }
    },
    onError: (_error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before)
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: studyKeys.brief(lectureId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.lecture(lectureId), exact: true })
      void queryClient.invalidateQueries({ queryKey: queryKeys.courseMap(courseId) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.nextStep(courseId) })
    },
  })
  return {
    ...mutation,
    toggle: (kind: MarkerKind, target: MarkTarget, existing: Marker | undefined) =>
      mutation.mutate({ kind, target, existing, id: newId() }),
  }
}
