// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDelayedPending } from './use-delayed-pending'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Harness({ isPending }: { isPending: boolean }) {
  return <>{String(useDelayedPending(isPending, { delay: 300, minDuration: 400 }))}</>
}

describe('useDelayedPending', () => {
  let container: HTMLDivElement
  let root: Root

  const render = (isPending: boolean) => act(() => root.render(<Harness isPending={isPending} />))
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
  const shown = () => container.textContent === 'true'

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    vi.useRealTimers()
  })

  it('never shows work that finishes within the delay', () => {
    render(true)
    advance(299)
    render(false)
    advance(1000)
    expect(shown()).toBe(false)
  })

  it('shows after the delay', () => {
    render(true)
    advance(299)
    expect(shown()).toBe(false)
    advance(1)
    expect(shown()).toBe(true)
  })

  it('keeps the indicator for the minimum duration once shown', () => {
    render(true)
    advance(300)
    render(false)
    advance(399)
    expect(shown()).toBe(true)
    advance(1)
    expect(shown()).toBe(false)
  })

  it('hides at once when the minimum has already passed', () => {
    render(true)
    advance(1000)
    render(false)
    advance(0)
    expect(shown()).toBe(false)
  })

  it('stays shown when work restarts during the hold', () => {
    render(true)
    advance(300)
    render(false)
    advance(200)
    render(true)
    advance(1000)
    expect(shown()).toBe(true)
  })
})
