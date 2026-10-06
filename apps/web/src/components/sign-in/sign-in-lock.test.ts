import { describe, expect, it } from 'vitest'
import { signInLock } from './sign-in-lock'

describe('signInLock', () => {
  it('lets one instance sign in at a time and frees the lock on release', () => {
    expect(signInLock.claim('hero')).toBe(true)
    expect(signInLock.claim('header')).toBe(false)
    expect(signInLock.claim('hero')).toBe(true)
    signInLock.release('header') // not the owner: no effect
    expect(signInLock.owner()).toBe('hero')
    signInLock.release('hero')
    expect(signInLock.claim('header')).toBe(true)
    expect(signInLock.touched()).toBe(true)
    signInLock.release('header')
  })
})
