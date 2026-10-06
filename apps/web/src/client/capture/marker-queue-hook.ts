'use client'

import type { MarkerInput, MarkerKind } from '@lectheo/contracts'
import { useQueryClient } from '@tanstack/react-query'
import { get, set } from 'idb-keyval'
import { useCallback, useEffect, useRef } from 'react'
import { API_BASE, apiFetch, isApiClientError } from '../api'
import { newId } from '../ids'
import { queryKeys } from '../queries'
import {
  createMarkerQueue,
  type MarkerQueue,
  type MarkerStore,
  type MarkerTransport,
} from './marker-queue'

/** Architecture §4.2: batch every 10 s (and on pause / stop / pagehide). */
export const MARKER_FLUSH_MS = 10_000

class MarkerSendError extends Error {
  constructor(readonly status: number) {
    super(`POST markers failed (${status})`)
  }
}

/** 4xx other than 401/408/429 won't succeed on retry (e.g. 409 no timestamps, 404 gone). */
const isPermanent = (error: unknown): boolean =>
  error instanceof MarkerSendError &&
  error.status >= 400 &&
  error.status < 500 &&
  ![401, 408, 429].includes(error.status)

/**
 * ponytail: IndexedDB can be unavailable (private mode, blocked storage); the queue then keeps
 * markers in memory only, which still covers the 10 s flush window.
 */
function idbStore(userId: string, lectureId: string): MarkerStore {
  // Keyed by user so a shared browser never posts one user's leftovers as another's.
  const key = `lectheo:markers:${userId}:${lectureId}`
  return {
    load: async () => (await get<MarkerInput[]>(key).catch(() => undefined)) ?? [],
    save: (markers) => set(key, markers).catch(() => undefined),
  }
}

function httpTransport(lectureId: string): MarkerTransport {
  const base = `${API_BASE}/lectures/${lectureId}/markers`
  return {
    // Raw fetch (not apiFetch) for `keepalive`, so a pagehide flush survives the unload.
    send: async (markers, { keepalive }) => {
      const res = await fetch(base, {
        method: 'POST',
        keepalive,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ markers }),
      })
      if (!res.ok) throw new MarkerSendError(res.status)
    },
    remove: (markerId) =>
      apiFetch(`${base}/${markerId}`, { method: 'DELETE' }).catch((error: unknown) => {
        if (!(isApiClientError(error) && error.status === 404)) throw error
      }),
    isPermanent,
  }
}

export interface MarkerQueueApi {
  /** Queues a marker at `tMs` (player time) and returns its client id. */
  add: (kind: MarkerKind, tMs: number) => string
  undo: (markerId: string) => Promise<void>
  flush: () => void
}

/**
 * The lecture's marker queue: flushes every 10 s, on pagehide / hidden tab, and on unmount.
 * Inactive until `userId` is known (the IndexedDB key is per user).
 */
export function useMarkerQueue(lectureId: string, userId: string | undefined): MarkerQueueApi {
  const queue = useRef<Promise<MarkerQueue> | null>(null)
  /** Each marker's queue, so undo from a toast still works after the page unmounts. */
  const owners = useRef(new Map<string, Promise<MarkerQueue>>())
  const queryClient = useQueryClient()
  // Course map, next step and the lecture page show marker counts / unlinked markers.
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.courses })
    // exact: the transcript under the lecture key didn't change.
    void queryClient.invalidateQueries({ queryKey: queryKeys.lecture(lectureId), exact: true })
  }, [queryClient, lectureId])
  /** Refreshes only when the flush actually sent markers. */
  const refreshIfSent = useCallback(
    (sent: number) => {
      if (sent > 0) refresh()
    },
    [refresh],
  )

  useEffect(() => {
    if (!userId) return
    const q = createMarkerQueue(idbStore(userId, lectureId), httpTransport(lectureId))
    queue.current = q
    // Failures stay queued for the next tick; nothing to surface mid-lecture.
    const flush = (keepalive = false) =>
      void q
        .then((x) => x.flush({ keepalive }))
        .then(refreshIfSent)
        .catch(() => undefined)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush(true)
    }
    const onPageHide = () => flush(true)

    flush()
    const timer = window.setInterval(flush, MARKER_FLUSH_MS)
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('pagehide', onPageHide)
      document.removeEventListener('visibilitychange', onVisibility)
      queue.current = null
      flush(true)
    }
  }, [lectureId, userId, refreshIfSent])

  const add = useCallback<MarkerQueueApi['add']>((kind, tMs) => {
    const q = queue.current
    if (!q) throw new Error('Markers aren’t ready yet.')
    const id = newId()
    const marker: MarkerInput = { id, kind, tMs: Math.max(0, Math.round(tMs)), capture: 'watch' }
    owners.current.set(id, q)
    void q.then((x) => x.add(marker))
    return id
  }, [])

  const undo = useCallback<MarkerQueueApi['undo']>(
    async (markerId) => {
      const q = owners.current.get(markerId)
      if (!q) throw new Error('That marker can’t be undone anymore.')
      await (await q).undo(markerId)
      owners.current.delete(markerId)
      refresh() // A sent marker was deleted on the server.
    },
    [refresh],
  )

  const flush = useCallback(() => {
    void queue.current
      ?.then((q) => q.flush())
      .then(refreshIfSent)
      .catch(() => undefined)
  }, [refreshIfSent])

  return { add, undo, flush }
}
