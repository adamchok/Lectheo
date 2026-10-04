import type { MarkerInput } from '@lectheo/contracts'
import { describe, expect, it, vi } from 'vitest'
import { createMarkerQueue, MAX_BATCH, type MarkerStore, type MarkerTransport } from './marker-queue'

const marker = (n: number): MarkerInput => ({
  id: `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`,
  kind: 'lost',
  tMs: n * 1000,
  capture: 'watch',
})

function memoryStore(initial: MarkerInput[] = []): MarkerStore & { saved: () => MarkerInput[] } {
  let data = initial
  return {
    load: async () => data,
    save: async (next) => {
      data = [...next]
    },
    saved: () => data,
  }
}

function transport(overrides: Partial<MarkerTransport> = {}) {
  return {
    send: vi.fn<MarkerTransport['send']>(async () => undefined),
    remove: vi.fn<MarkerTransport['remove']>(async () => undefined),
    ...overrides,
  }
}

describe('createMarkerQueue', () => {
  it('sends pending markers and clears them from the store only after success', async () => {
    const store = memoryStore()
    const t = transport()
    const queue = await createMarkerQueue(store, t)
    await queue.add(marker(1))
    await queue.add(marker(2))
    expect(store.saved()).toHaveLength(2)
    await queue.flush()
    expect(t.send).toHaveBeenCalledWith([marker(1), marker(2)], { keepalive: false })
    expect(store.saved()).toEqual([])
  })

  it('keeps the batch on a transient failure and resends the same ids later', async () => {
    const t = transport({ send: vi.fn().mockRejectedValueOnce(new Error('offline')) })
    const queue = await createMarkerQueue(memoryStore(), t)
    await queue.add(marker(1))
    await expect(queue.flush()).rejects.toThrow('offline')
    expect(queue.pendingCount()).toBe(1)
    await queue.flush()
    expect(t.send).toHaveBeenNthCalledWith(2, [marker(1)], { keepalive: false })
    expect(queue.pendingCount()).toBe(0)
  })

  it('drops a batch the server will never accept', async () => {
    const t = transport({
      send: vi.fn().mockRejectedValue(new Error('409')),
      isPermanent: () => true,
    })
    const queue = await createMarkerQueue(memoryStore(), t)
    await queue.add(marker(1))
    await queue.flush()
    expect(queue.pendingCount()).toBe(0)
  })

  it('resumes markers left by an earlier session, in batches of MAX_BATCH', async () => {
    const leftovers = Array.from({ length: MAX_BATCH + 5 }, (_, i) => marker(i + 1))
    const t = transport()
    const queue = await createMarkerQueue(memoryStore(leftovers), t)
    await queue.flush()
    expect(vi.mocked(t.send).mock.calls[0]?.[0]).toHaveLength(MAX_BATCH)
    expect(queue.pendingCount()).toBe(5)
  })

  it('keeps markers added while a batch is in flight', async () => {
    let release: () => void = () => undefined
    const t = transport({ send: vi.fn(() => new Promise<void>((r) => (release = r))) })
    const queue = await createMarkerQueue(memoryStore(), t)
    await queue.add(marker(1))
    const flushing = queue.flush()
    await queue.add(marker(2))
    expect(queue.flush()).toBe(flushing)
    release()
    await flushing
    expect(queue.pendingCount()).toBe(1)
  })

  it('undo drops an unsent marker without calling the server', async () => {
    const t = transport()
    const queue = await createMarkerQueue(memoryStore(), t)
    await queue.add(marker(1))
    await queue.undo(marker(1).id)
    expect(queue.pendingCount()).toBe(0)
    expect(t.remove).not.toHaveBeenCalled()
    await queue.flush()
    expect(t.send).not.toHaveBeenCalled()
  })

  it('undo of an in-flight marker waits for the send, then DELETEs it', async () => {
    let release: () => void = () => undefined
    const order: string[] = []
    const t = transport({
      send: vi.fn(() => new Promise<void>((r) => (release = r)).then(() => void order.push('send'))),
      remove: vi.fn(async () => void order.push('remove')),
    })
    const queue = await createMarkerQueue(memoryStore(), t)
    await queue.add(marker(1))
    void queue.flush()
    const undoing = queue.undo(marker(1).id)
    release()
    await undoing
    expect(order).toEqual(['send', 'remove'])
    expect(t.remove).toHaveBeenCalledWith(marker(1).id)
  })
})
