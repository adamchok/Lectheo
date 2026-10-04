import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getLocalMedia,
  matchesImportedMedia,
  registerLocalMedia,
  releaseLocalMedia,
} from './local-player-registry'

const file = (name: string) => new File(['x'], name, { type: 'video/mp4' })

afterEach(() => {
  releaseLocalMedia('a')
  releaseLocalMedia('b')
  vi.restoreAllMocks()
})

describe('local player registry', () => {
  it('keeps one object URL per lecture and revokes the old one on replace', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const first = registerLocalMedia('a', file('w1.mp4'))
    expect(getLocalMedia('a')).toMatchObject({ url: first, file: { name: 'w1.mp4' } })
    const second = registerLocalMedia('a', file('w1b.mp4'))
    expect(revoke).toHaveBeenCalledWith(first)
    expect(getLocalMedia('a')?.url).toBe(second)
    expect(getLocalMedia('b')).toBeUndefined()
  })

  it('release revokes and forgets; releasing an unknown id is a no-op', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const url = registerLocalMedia('b', file('w2.mp4'))
    releaseLocalMedia('b')
    releaseLocalMedia('b')
    expect(revoke).toHaveBeenCalledTimes(1)
    expect(revoke).toHaveBeenCalledWith(url)
    expect(getLocalMedia('b')).toBeUndefined()
  })

  it('matches a re-picked file by name and, when known, duration', () => {
    const media = { localFileName: 'w1.mp4', durationMs: 60_000 }
    expect(matchesImportedMedia({ name: 'w1.mp4' }, media)).toBe(true)
    expect(matchesImportedMedia({ name: 'w1.mp4', durationMs: 61_000 }, media)).toBe(true)
    expect(matchesImportedMedia({ name: 'w1.mp4', durationMs: 90_000 }, media)).toBe(false)
    expect(matchesImportedMedia({ name: 'other.mp4' }, media)).toBe(false)
    expect(matchesImportedMedia({ name: 'any.mp4' }, { localFileName: null })).toBe(true)
  })
})
