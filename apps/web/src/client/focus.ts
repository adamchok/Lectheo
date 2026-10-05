import { useEffect, useRef, type RefObject } from 'react'

/**
 * Focuses the element once it mounts. For content that replaces the control the user just used
 * (a submitted form, a "Next" button), so keyboard focus never drops to <body> (WCAG 2.4.3).
 * Non-interactive targets need `tabIndex={-1}`.
 */
export function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null)
  useEffect(() => ref.current?.focus(), [])
  return ref
}
