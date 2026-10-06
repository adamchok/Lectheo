// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

describe('Course actions (F0.7)', () => {
  const course = { id: 'c1', title: 'Biology' }

  it('Delete course confirms with the consequence and starts focus on Cancel', () => {
    act(() => root.render(<CourseActions course={course} lectureCount={3} />))
    act(() => buttonNamed('Delete course')?.click())
    expect(dialog()?.textContent).toContain('Delete “Biology”?')
    expect(dialog()?.textContent).toContain('This deletes its 3 lectures, the concept map')
    expect(buttonIn(dialog()!, 'Delete course')?.dataset.variant).toBe('destructive')
    expect(document.activeElement).toBe(buttonIn(dialog()!, 'Cancel'))
  })

  it('Rename opens a small dialog with the current title', () => {
    act(() => root.render(<CourseActions course={course} lectureCount={1} />))
    act(() => buttonNamed('Rename')?.click())
    expect(dialog()?.textContent).toContain('Rename course')
    expect(dialog()?.querySelector('input')?.value).toBe('Biology')
  })
})
