// @vitest-environment happy-dom
import { ArrowRight, Play } from 'lucide-react'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './button'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Button pending', () => {
  let container: HTMLDivElement
  let root: Root

  const render = (ui: ReactNode) => act(() => root.render(ui))
  const button = () => container.querySelector('button')!
  const icons = () => [...button().querySelectorAll('svg')].map((svg) => svg.dataset.slot ?? 'icon')

  beforeEach(() => {
    container = document.createElement('div')
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
  })

  it('swaps the leading icon for the spinner and keeps the trailing icon', () => {
    render(
      <Button pending>
        <Play aria-hidden />
        Watch
        <ArrowRight aria-hidden />
      </Button>,
    )
    expect(icons()).toEqual(['spinner', 'icon'])
    expect(button().getAttribute('aria-busy')).toBe('true')
    expect(button().textContent).toBe('Watch')
  })

  it('leads with the spinner when there is no leading icon', () => {
    render(
      <Button pending>
        Start
        <ArrowRight aria-hidden />
      </Button>,
    )
    expect(icons()).toEqual(['spinner', 'icon'])
  })

  it('ignores clicks while pending', () => {
    const onClick = vi.fn()
    render(
      <Button pending onClick={onClick}>
        Submit
      </Button>,
    )
    act(() => button().click())
    expect(onClick).not.toHaveBeenCalled()
  })

  it('announces the pending label in a polite status region', () => {
    render(<Button pendingLabel="Grading…">Submit</Button>)
    const status = container.querySelector('[role="status"]')!
    expect(status.textContent).toBe('')
    render(
      <Button pending pendingLabel="Grading…">
        Submit
      </Button>,
    )
    expect(status.textContent).toBe('Grading…')
  })

  it('ignores pending with asChild', () => {
    render(
      <Button asChild pending>
        <a href="/x">Go</a>
      </Button>,
    )
    const link = container.querySelector('a')!
    expect(link.hasAttribute('aria-busy')).toBe(false)
    expect(link.querySelector('svg')).toBeNull()
  })
})
