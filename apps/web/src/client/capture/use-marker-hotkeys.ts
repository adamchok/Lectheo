'use client'

import type { MarkerKind } from '@lectheo/contracts'
import { useEffect, useRef, type RefObject } from 'react'
import { isBareShortcut } from '../keyboard'

const KEY_TO_MARKER: Readonly<Record<string, MarkerKind>> = { l: 'lost', i: 'important' }

/** `aria-keyshortcuts` values for the marker buttons. */
export const MARKER_SHORTCUTS: Readonly<Record<MarkerKind, string>> = { lost: 'L', important: 'I' }

/** Maps a key event to a marker kind, or null when it isn't a marker shortcut. */
export function markerKindForEvent(event: KeyboardEvent): MarkerKind | null {
  const kind = KEY_TO_MARKER[event.key.toLowerCase()]
  if (!kind || event.shiftKey) return null
  return isBareShortcut(event) ? kind : null
}

/**
 * L → "I'm lost", I → "Important" (F1.1). Only while focus is inside `scope` (the watch region:
 * player, marker buttons, transcript), so single-key shortcuts never fire elsewhere on the page
 * (WCAG 2.1.4). Ignored while a text field has focus, and for modified or auto-repeated presses.
 */
export function useMarkerHotkeys(
  onMarker: (kind: MarkerKind) => void,
  options: { scope: RefObject<HTMLElement | null>; enabled?: boolean },
): void {
  const { scope, enabled = true } = options
  const callback = useRef(onMarker)

  useEffect(() => {
    callback.current = onMarker
  }, [onMarker])

  useEffect(() => {
    const region = scope.current
    if (!enabled || !region) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // Right after navigation focus rests on <body> or <main> (nothing chosen yet): the watch
      // page is the only thing to act on, so L/I work there too. Any other control opts out.
      const idle = target === document.body || target?.id === 'main'
      if (!idle && !(target && region.contains(target))) return
      const kind = markerKindForEvent(event)
      if (!kind) return
      event.preventDefault()
      callback.current(kind)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, scope])
}
