import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { duration, ease } from './motion'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

function cssToken(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`--${name} missing from globals.css`)
  return match[1]!.trim()
}

describe('motion tokens', () => {
  it.each(Object.entries(duration))('duration-%s matches globals.css', (name, seconds) => {
    expect(cssToken(`duration-${name}`)).toBe(`${Math.round(seconds * 1000)}ms`)
  })

  it.each(Object.entries(ease))('ease-%s matches globals.css', (name, curve) => {
    expect(cssToken(`ease-${name}`)).toBe(`cubic-bezier(${curve.join(', ')})`)
  })
})
