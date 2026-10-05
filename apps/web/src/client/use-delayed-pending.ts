'use client'

import { useEffect, useRef, useState } from 'react'

export interface DelayedPendingOptions {
  /** Don't show the indicator for work that finishes sooner than this (ms). */
  delay?: number
  /** Once shown, keep the indicator up at least this long (ms). */
  minDuration?: number
}

/**
 * Anti-flash rule (Design System §3): a skeleton or spinner appears only after `delay` ms of
 * pending work and, once visible, stays for at least `minDuration` ms.
 */
export function useDelayedPending(
  isPending: boolean,
  { delay = 300, minDuration = 400 }: DelayedPendingOptions = {},
): boolean {
  const [shown, setShown] = useState(false)
  const shownAt = useRef(0)

  useEffect(() => {
    if (isPending === shown) return
    const wait = isPending ? delay : Math.max(0, minDuration - (Date.now() - shownAt.current))
    const timer = setTimeout(() => {
      shownAt.current = Date.now()
      setShown(isPending)
    }, wait)
    return () => clearTimeout(timer)
  }, [isPending, shown, delay, minDuration])

  return shown
}
