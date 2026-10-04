'use client'

import type { MarkerKind } from '@lectheo/contracts'
import { useEffect, useRef } from 'react'
import { isBareShortcut } from '../keyboard'

const KEY_TO_MARKER: Readonly<Record<string, MarkerKind>> = { l: 'lost', i: 'important' }

/** Maps a key event to a marker kind, or null when it isn't a marker shortcut. */
export function markerKindForEvent(event: KeyboardEvent): MarkerKind | null {
  const kind = KEY_TO_MARKER[event.key.toLowerCase()]
  if (!kind || event.shiftKey) return null
  return isBareShortcut(event) ? kind : null
}

/**
 * L → "I'm lost", I → "Important" (F1.1). Ignored while an input, textarea, select or
 * contenteditable has focus, and for modified or auto-repeated presses.
 */
export function useMarkerHotkeys(
  onMarker: (kind: MarkerKind) => void,
  options: { enabled?: boolean } = {},
): void {
  const { enabled = true } = options
  const callback = useRef(onMarker)

  useEffect(() => {
    callback.current = onMarker
  }, [onMarker])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      const kind = markerKindForEvent(event)
      if (!kind) return
      event.preventDefault()
      callback.current(kind)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
