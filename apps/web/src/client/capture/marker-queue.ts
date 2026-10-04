import type { MarkerInput } from '@lectheo/contracts'

/*
 * Watch-mode marker queue (Architecture §4.2, ADR-007). Markers land in a durable store first
 * (IndexedDB in the app), then go to POST /lectures/{id}/markers in batches. A batch leaves the
 * store only after the server accepted it, so a crash or offline spell resends it later; the
 * server dedupes by client id (ON CONFLICT DO NOTHING).
 */

/** API Spec §5: max markers per POST. */
export const MAX_BATCH = 200

export interface MarkerStore {
  load: () => Promise<MarkerInput[]>
  save: (markers: readonly MarkerInput[]) => Promise<void>
}

export interface MarkerTransport {
  /** POST a batch. Resolves when the server accepted it; rejects to retry later. */
  send: (markers: readonly MarkerInput[], options: { keepalive: boolean }) => Promise<void>
  /** DELETE an already-sent marker (soft delete). A 404 (never arrived) resolves. */
  remove: (markerId: string) => Promise<void>
  /** True when the error will never succeed on retry (the batch is dropped). */
  isPermanent?: (error: unknown) => boolean
}

export interface MarkerQueue {
  add: (marker: MarkerInput) => Promise<void>
  /** Sends up to MAX_BATCH pending markers; one flush at a time. Resolves to the number sent. */
  flush: (options?: { keepalive?: boolean }) => Promise<number>
  /** Undo: drops an unsent marker, or DELETEs one the server already has. */
  undo: (markerId: string) => Promise<void>
  pendingCount: () => number
}

/**
 * ponytail: one queue per tab; the in-memory list mirrors the store so pagehide can send
 * synchronously. Two tabs on the same lecture could both send a marker; the server dedupes.
 */
export async function createMarkerQueue(
  store: MarkerStore,
  transport: MarkerTransport,
): Promise<MarkerQueue> {
  let pending: readonly MarkerInput[] = await store.load()
  let inFlight: Promise<number> | null = null
  let inFlightIds: ReadonlySet<string> = new Set()

  const persist = (next: readonly MarkerInput[]): Promise<void> => {
    pending = next
    return store.save(next)
  }

  const sendBatch = async (batch: readonly MarkerInput[], keepalive: boolean): Promise<number> => {
    let accepted = true
    try {
      await transport.send(batch, { keepalive })
    } catch (error) {
      if (!transport.isPermanent?.(error)) throw error
      accepted = false
    }
    const sent = new Set(batch.map((m) => m.id))
    await persist(pending.filter((m) => !sent.has(m.id)))
    return accepted ? batch.length : 0
  }

  const flush: MarkerQueue['flush'] = ({ keepalive = false } = {}) => {
    if (inFlight) return inFlight
    const batch = pending.slice(0, MAX_BATCH)
    if (batch.length === 0) return Promise.resolve(0)
    inFlightIds = new Set(batch.map((m) => m.id))
    inFlight = sendBatch(batch, keepalive).finally(() => {
      inFlight = null
      inFlightIds = new Set()
    })
    return inFlight
  }

  const undo: MarkerQueue['undo'] = async (markerId) => {
    // A batch in flight may contain this marker: wait so the DELETE can't overtake the INSERT.
    const wasInFlight = inFlightIds.has(markerId)
    await inFlight?.catch(() => undefined)
    if (pending.some((m) => m.id === markerId)) {
      await persist(pending.filter((m) => m.id !== markerId))
      // A failed send may still have reached the server (e.g. timeout after commit).
      if (wasInFlight) await transport.remove(markerId)
      return
    }
    await transport.remove(markerId)
  }

  return {
    add: (marker) => persist([...pending, marker]),
    flush,
    undo,
    pendingCount: () => pending.length,
  }
}
