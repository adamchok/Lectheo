// @vitest-environment happy-dom
import type { CourseMapResponse, MapNode } from '@lectheo/contracts'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConceptMap } from './concept-map'
import { LectureTimeline } from './lecture-timeline'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const L1 = '0190a000-0000-7000-8000-00000000l001'

function node(id: string, name: string, extra: Partial<MapNode> = {}): MapNode {
  return {
    id,
    name,
    summary: '',
    lectureIds: [L1],
    mastery: { state: 'gray', confidentMistake: false, reasons: [] },
    markers: { lost: 0, important: 0 },
    moments: [],
    position: { x: 0, y: 0 },
    ...extra,
  }
}

const map: CourseMapResponse = {
  course: { id: 'course', title: 'CS50', kind: 'library', attribution: null },
  lectures: [{ id: L1, title: 'Lecture 1', seq: 1, status: 'ready', hasTimestamps: true }],
  nodes: [
    node('arrays', 'Arrays', {
      position: { x: 0, y: 200 },
      mastery: { state: 'red', confidentMistake: true, reasons: ['Sure and wrong'] },
      markers: { lost: 1, important: 0 },
      moments: [{ id: 'm1', lectureId: L1, kind: 'lost', tMs: 61_000 }],
    }),
    node('types', 'Types', {
      position: { x: 0, y: 0 },
      // m1 is linked to two concepts: the timeline shows it once.
      moments: [{ id: 'm1', lectureId: L1, kind: 'lost', tMs: 61_000 }],
    }),
  ],
  edges: [{ id: 'e1', from: 'arrays', to: 'types', relation: 'depends_on' }],
  unlinkedMarkers: [{ id: 'm2', lectureId: L1, kind: 'important', tMs: 120_000 }],
}

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
  vi.unstubAllGlobals()
})

describe('LectureTimeline', () => {
  it('shows linked and unlinked markers once each, linking to the moment', () => {
    act(() => root.render(<LectureTimeline map={map} />))
    const links = [...container.querySelectorAll('a')]
    expect(links).toHaveLength(2)
    expect(links[0]?.getAttribute('href')).toBe(`/lectures/${L1}?t=61000#transcript`)
    expect(links[0]?.getAttribute('aria-label')).toMatch(/^Lost at /)
    expect(links[1]?.getAttribute('aria-label')).toMatch(/^Important at .*, unlinked$/)
  })
})

describe('ConceptMap', () => {
  it('renders labelled, focusable nodes in reading order and opens one on Enter', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    const onOpen = vi.fn()
    act(() =>
      root.render(
        <TooltipProvider>
          <ConceptMap map={map} selectedId={null} onOpen={onOpen} />
        </TooltipProvider>,
      ),
    )
    const nodes = [...container.querySelectorAll<HTMLElement>('.react-flow__node')]
    expect(nodes.map((n) => n.dataset.id)).toEqual(['types', 'arrays'])
    expect(nodes[1]?.getAttribute('aria-label')).toBe(
      'Arrays, Needs work, confident mistake, 1 lost. Sure and wrong. Press Enter for details.',
    )
    expect(nodes[1]?.tabIndex).toBe(0)
    act(() => {
      nodes[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onOpen).toHaveBeenCalledWith('arrays')
  })
})
