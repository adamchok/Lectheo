// @vitest-environment happy-dom
import type { MarkerKind } from '@lectheo/contracts'
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMarkerHotkeys } from './use-marker-hotkeys'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

function Harness({ onMarker, enabled }: { onMarker: (k: MarkerKind) => void; enabled?: boolean }) {
  const scope = useRef<HTMLDivElement>(null)
  useMarkerHotkeys(onMarker, { scope, enabled })
  return (
    <>
      <div ref={scope}>
        <input aria-label="text" />
        <textarea aria-label="notes" />
        <div aria-label="editor" contentEditable suppressContentEditableWarning />
        <button type="button">Play</button>
      </div>
      <button type="button">Outside</button>
    </>
  )
}

function press(key: string, init: KeyboardEventInit = {}, target?: EventTarget) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  // Default: a button inside the watch region (the hook listens on the region).
  const el = target ?? document.querySelector('button')!
  act(() => {
    el.dispatchEvent(event)
  })
  return event
}

describe('useMarkerHotkeys', () => {
  let container: HTMLDivElement
  let root: Root
  const onMarker = vi.fn<(kind: MarkerKind) => void>()

  function mount(enabled?: boolean) {
    act(() => root.render(<Harness onMarker={onMarker} enabled={enabled} />))
  }

  beforeEach(() => {
    onMarker.mockReset()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('calls back with lost for L and important for I', () => {
    mount()
    press('l')
    press('I')
    expect(onMarker.mock.calls).toEqual([['lost'], ['important']])
  })

  it('ignores other keys, modifiers and auto-repeat', () => {
    mount()
    press('k')
    press('l', { ctrlKey: true })
    press('i', { metaKey: true })
    press('l', { repeat: true })
    expect(onMarker).not.toHaveBeenCalled()
  })

  it.each(['input', 'textarea', '[contenteditable]'])('is ignored while %s has focus', (sel) => {
    mount()
    const field = container.querySelector<HTMLElement>(sel)!
    field.focus()
    press('l', {}, field)
    press('i', {}, field)
    expect(onMarker).not.toHaveBeenCalled()
  })

  it('still works while a button has focus', () => {
    mount()
    const button = container.querySelector('button')!
    button.focus()
    press('l', {}, button)
    expect(onMarker).toHaveBeenCalledWith('lost')
  })

  it('does nothing while another control outside the watch region has focus', () => {
    mount()
    const outside = [...container.querySelectorAll('button')].at(-1)!
    outside.focus()
    press('i', {}, outside)
    expect(onMarker).not.toHaveBeenCalled()
  })

  it('works while nothing is focused yet (body), as right after navigating to the page', () => {
    mount()
    press('l', {}, document.body)
    expect(onMarker).toHaveBeenCalledWith('lost')
  })

  it('does nothing when disabled', () => {
    mount(false)
    press('l')
    expect(onMarker).not.toHaveBeenCalled()
  })
})
