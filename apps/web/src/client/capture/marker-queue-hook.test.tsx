// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type MarkerQueueApi, useMarkerQueue } from './marker-queue-hook'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const idb = new Map<string, unknown>()
vi.mock('idb-keyval', () => ({
  get: async (key: string) => idb.get(key),
  set: async (key: string, value: unknown) => void idb.set(key, value),
}))

const LECTURE = '0190a000-0000-7000-8000-000000000011'
const USER = '0190a000-0000-7000-8000-000000000001'

let root: Root
let api: MarkerQueueApi
const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
  init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({}),
)

function Harness({ userId }: { userId: string | undefined }) {
  api = useMarkerQueue(LECTURE, userId)
  return null
}

async function mount(userId: string | undefined) {
  const client = new QueryClient()
  root = createRoot(document.createElement('div'))
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <Harness userId={userId} />
      </QueryClientProvider>,
    )
  })
}

const deletes = () =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE').map(([url]) => url)

beforeEach(() => {
  idb.clear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useMarkerQueue', () => {
  it('stores markers under a per-user IndexedDB key', async () => {
    await mount(USER)
    await act(async () => {
      api.add('lost', 1_000)
    })
    expect([...idb.keys()]).toEqual([`lectheo:markers:${USER}:${LECTURE}`])
    await act(async () => root.unmount())
  })

  it('undo after unmount still reaches the queue (the toast outlives the page)', async () => {
    await mount(USER)
    let id = ''
    await act(async () => {
      id = api.add('lost', 1_000)
    })
    await act(async () => root.unmount()) // flushes the marker on the way out
    await expect(api.undo(id)).resolves.toBeUndefined()
    expect(deletes()).toEqual([`/api/v1/lectures/${LECTURE}/markers/${id}`])
  })

  it('throws instead of silently ignoring an undo it cannot perform', async () => {
    await mount(undefined)
    expect(() => api.add('lost', 1_000)).toThrow()
    await expect(api.undo('0190a000-0000-7000-8000-000000000999')).rejects.toThrow()
    await act(async () => root.unmount())
  })
})
