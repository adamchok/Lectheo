'use client'

import type { MarkerInput, MarkerKind } from '@lectheo/contracts'
import { get, set } from 'idb-keyval'
import { useCallback, useEffect, useRef } from 'react'
import { API_BASE, apiFetch } from '../api'
import { newId } from '../ids'
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
function idbStore(lectureId: string): MarkerStore {
  const key = `lectheo:markers:${lectureId}`
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
    remove: (markerId) => apiFetch(`${base}/${markerId}`, { method: 'DELETE' }),
    isPermanent,
  }
}

export interface MarkerQueueApi {
  /** Queues a marker at `tMs` (player time) and returns its client id. */
  add: (kind: MarkerKind, tMs: number) => string
  undo: (markerId: string) => Promise<void>
  flush: () => void
}

/** The lecture's marker queue: flushes every 10 s, on pagehide / hidden tab, and on unmount. */
export function useMarkerQueue(lectureId: string): MarkerQueueApi {
  const queue = useRef<Promise<MarkerQueue> | null>(null)

  useEffect(() => {
    const q = createMarkerQueue(idbStore(lectureId), httpTransport(lectureId))
    queue.current = q
    // Failures stay queued for the next tick; nothing to surface mid-lecture.
    const flush = (keepalive = false) =>
      void q.then((x) => x.flush({ keepalive })).catch(() => undefined)
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
      flush(true)
    }
  }, [lectureId])

  const add = useCallback<MarkerQueueApi['add']>((kind, tMs) => {
    const id = newId()
    const marker: MarkerInput = { id, kind, tMs: Math.max(0, Math.round(tMs)), capture: 'watch' }
    void queue.current?.then((q) => q.add(marker))
    return id
  }, [])

  const undo = useCallback<MarkerQueueApi['undo']>(async (markerId) => {
    const q = await queue.current
    await q?.undo(markerId)
  }, [])

  const flush = useCallback(() => {
    void queue.current?.then((q) => q.flush()).catch(() => undefined)
  }, [])

  return { add, undo, flush }
}
