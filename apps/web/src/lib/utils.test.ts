import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('keeps a type-scale size next to a text colour', () => {
    expect(cn('text-title-lg', 'text-muted-foreground')).toBe('text-title-lg text-muted-foreground')
  })

  it('lets a later type-scale size win over an earlier one', () => {
    expect(cn('text-sm text-caption')).toBe('text-caption')
  })

  it('merges design-system shadows and z-indexes', () => {
    expect(cn('shadow-xs', 'shadow-popover')).toBe('shadow-popover')
    expect(cn('z-50', 'z-overlay')).toBe('z-overlay')
  })
})
