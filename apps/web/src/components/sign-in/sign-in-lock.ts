import { useSyncExternalStore } from 'react'

/**
 * One sign-in at a time across every SignInActions on the page (header, menu, hero, closing CTA),
 * so a second click elsewhere can't start a second Turnstile check or sample account.
 */
let owner: string | null = null
let touched = false
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((listener) => listener())

export const signInLock = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  owner: (): string | null => owner,
  /** Whether any sign-in was started on this page (hides a stale `?error=auth` message). */
  touched: (): boolean => touched,
  /** Takes the lock for `id`; false when another instance holds it. */
  claim(id: string): boolean {
    touched = true
    if (owner !== null && owner !== id) {
      emit()
      return false
    }
    owner = id
    emit()
    return true
  },
  release(id: string): void {
    if (owner !== id) return
    owner = null
    emit()
  },
}

/** Whether any instance is signing in right now. */
export function useSignInBusy(): boolean {
  return useSyncExternalStore(signInLock.subscribe, signInLock.owner, () => null) !== null
}

export function useSignInTouched(): boolean {
  return useSyncExternalStore(signInLock.subscribe, signInLock.touched, () => false)
}
