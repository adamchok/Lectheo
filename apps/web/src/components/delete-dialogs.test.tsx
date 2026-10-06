// @vitest-environment happy-dom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from './ui/tooltip'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
const mutation = () => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
})
vi.mock('@/client/queries', () => ({
  POLLING_LECTURE_STATUSES: ['processing', 'map_ready'],
  useDeleteAccount: mutation,
  useDeleteCourse: mutation,
  useRenameCourse: mutation,
}))

const { DeleteAccountDialog } = await import('./account-menu')
const { CourseActions } = await import('./course/course-actions')

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
// A Button with a pendingLabel also renders that label (hidden), hence startsWith.
const buttonIn = (scope: ParentNode, name: string) =>
  [...scope.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(name))
const buttonNamed = (name: string) => buttonIn(document, name)

describe('Delete account dialog (F0.6)', () => {
  it('names the consequence, repeats the verb, and starts focus on Cancel', () => {
    act(() => root.render(<DeleteAccountDialog open onOpenChange={() => {}} />))
    expect(dialog()?.textContent).toContain('Delete your account?')
    expect(dialog()?.textContent).toContain(
      "This deletes your courses, lectures, marks and practice, and signs you out. It can't be undone.",
    )
    expect(buttonNamed('Delete account')?.dataset.variant).toBe('destructive')
    expect(document.activeElement).toBe(buttonNamed('Cancel'))
  })
})

describe('Menu-opened dialogs', () => {
  it('return focus to the account button on close (the menu item is gone)', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    const ref = { current: trigger }
    function Harness() {
      const [open, setOpen] = useState(true)
      return <DeleteAccountDialog open={open} onOpenChange={setOpen} returnFocusTo={ref} />
    }
    act(() => root.render(<Harness />))
    act(() => buttonIn(dialog()!, 'Cancel')?.click())
    // Radix restores focus on the next tick.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})

describe('Course actions (F0.7)', () => {
  const course = { id: 'c1', title: 'Biology' }
  const ready = { status: 'ready' } as const

  it('Delete course confirms with the consequence and starts focus on Cancel', () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <CourseActions course={course} lectures={[ready, ready, ready]} />
        </TooltipProvider>,
      ),
    )
    act(() => buttonNamed('Delete course')?.click())
    expect(dialog()?.textContent).toContain('Delete “Biology”?')
    expect(dialog()?.textContent).toContain('This deletes its 3 lectures, the concept map')
    expect(buttonIn(dialog()!, 'Delete course')?.dataset.variant).toBe('destructive')
    expect(document.activeElement).toBe(buttonIn(dialog()!, 'Cancel'))
  })

  it('Rename opens a small dialog with the current title', () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <CourseActions course={course} lectures={[ready]} />
        </TooltipProvider>,
      ),
    )
    act(() => buttonNamed('Rename')?.click())
    expect(dialog()?.textContent).toContain('Rename course')
    expect(dialog()?.querySelector('input')?.value).toBe('Biology')
  })

  it('Rename refuses a blank name with a message', () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <CourseActions course={course} lectures={[ready]} />
        </TooltipProvider>,
      ),
    )
    act(() => buttonNamed('Rename')?.click())
    const input = dialog()!.querySelector('input')!
    act(() => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(input, '   ')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => buttonIn(dialog()!, 'Save')?.click())
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('Enter a course name.')
    expect(input.getAttribute('aria-invalid')).toBe('true')
  })

  it('Delete course is aria-disabled with the reason while a lecture processes', () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <CourseActions course={course} lectures={[ready, { status: 'processing' }]} />
        </TooltipProvider>,
      ),
    )
    const button = buttonNamed('Delete course')!
    expect(button.getAttribute('aria-disabled')).toBe('true')
    const reason = document.getElementById(button.getAttribute('aria-describedby')!)
    expect(reason?.textContent).toContain('once its lectures finish processing')
    act(() => button.click())
    expect(dialog()).toBeNull()
  })
})
