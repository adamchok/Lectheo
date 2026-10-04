// @vitest-environment happy-dom
import type { MarkerKind } from '@lectheo/contracts'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkerHotkeys } from '@/client/capture/use-marker-hotkeys'
import { AuthorChat } from './author-chat'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

interface HarnessProps {
  onAsk: (text: string) => Promise<unknown>
  onMarker: (kind: MarkerKind) => void
  turnsLeft?: number
}

function Harness({ onAsk, onMarker, turnsLeft = 6 }: HarnessProps) {
  useMarkerHotkeys(onMarker)
  return (
    <AuthorChat messages={[]} turnsLeft={turnsLeft} turnBudget={6} onAsk={onAsk} pending={false} />
  )
}

describe('AuthorChat', () => {
  let container: HTMLDivElement
  let root: Root
  const onAsk = vi.fn<(text: string) => Promise<unknown>>()
  const onMarker = vi.fn<(kind: MarkerKind) => void>()

  beforeEach(() => {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    onAsk.mockReset().mockResolvedValue(undefined)
    onMarker.mockReset()
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const input = () => container.querySelector<HTMLInputElement>('#author-question')!
  const type = (text: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input(), text)
      input().dispatchEvent(new Event('input', { bubbles: true }))
    })
  const send = () =>
    act(async () => {
      input().form!.requestSubmit()
    })

  it('shows turns left; Enter sends the trimmed question and clears the box', async () => {
    act(() => root.render(<Harness onAsk={onAsk} onMarker={onMarker} />))
    expect(container.textContent).toContain('6 of 6 questions left')
    type('  Why O(1)?  ')
    await send()
    expect(onAsk).toHaveBeenCalledWith('Why O(1)?')
    expect(input().value).toBe('')
  })

  it('L and I typed in the question box never fire marker hotkeys', () => {
    act(() => root.render(<Harness onAsk={onAsk} onMarker={onMarker} />))
    input().focus()
    for (const key of ['l', 'i', 'L', 'I']) {
      act(() => {
        input().dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        )
      })
    }
    expect(onMarker).not.toHaveBeenCalled()
  })

  it('restores the draft when asking fails, and disables input with no turns left', async () => {
    onAsk.mockRejectedValueOnce(new Error('boom'))
    act(() => root.render(<Harness onAsk={onAsk} onMarker={onMarker} />))
    type('Is 3 right?')
    await send()
    expect(input().value).toBe('Is 3 right?')

    act(() => root.render(<Harness onAsk={onAsk} onMarker={onMarker} turnsLeft={0} />))
    expect(input().disabled).toBe(true)
    expect(container.textContent).toContain('No questions left')
  })
})
