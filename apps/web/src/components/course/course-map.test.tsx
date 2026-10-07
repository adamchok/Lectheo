// @vitest-environment happy-dom
import type { CourseMapResponse, MapNode } from '@lectheo/contracts'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConceptMap, edgeHandles } from './concept-map'
import {
  clusterMarkers,
  LectureTimeline,
  lectureAxis,
  type TimelineMarker,
} from './lecture-timeline'
import { TaughtAt } from './node-panel'

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
    sources: [],
    position: { x: 0, y: 0 },
    ...extra,
  }
}

const map: CourseMapResponse = {
  course: { id: 'course', title: 'CS50', kind: 'library', attribution: null },
  lectures: [
    {
      id: L1,
      title: 'Lecture 1',
      seq: 1,
      status: 'ready',
      hasTimestamps: true,
      startMs: 0,
      durationMs: 600_000,
      chapterStartsMs: [0, 300_000],
    },
  ],
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

  it('runs over the real lecture length with chapter ticks and start/end times (F2.11)', () => {
    act(() => root.render(<LectureTimeline map={map} />))
    // The first chapter starts the lecture: one tick, at 5:00.
    const ticks = [...container.querySelectorAll<HTMLElement>('[data-testid="chapter-tick"]')]
    expect(ticks.map((t) => t.style.left)).toEqual(['50%'])
    // Screen readers get the range in the list's name, not as bare times.
    expect(
      container.querySelector('ul[aria-label^="Markers in"]')?.getAttribute('aria-label'),
    ).toMatch(/^Markers in Lecture 1, .+ to .+$/)
    expect(container.textContent).toContain('0:00')
    expect(container.textContent).toContain('10:00')
  })
})

describe('clusterMarkers', () => {
  const at = (id: string, tMs: number): TimelineMarker => ({
    id,
    lectureId: L1,
    kind: 'lost',
    tMs,
    unlinked: false,
  })
  // A library window: 10:00 to 40:00 of the video.
  const axis = { startMs: 600_000, endMs: 2_400_000 }
  const markers = [at('a', 600_000), at('b', 1_500_000), at('c', 1_530_000), at('d', 2_400_000)]

  it('places markers relative to the lecture start', () => {
    const [, mid] = clusterMarkers(markers, axis, 3000)
    expect(mid?.leftPct).toBe(50)
  })

  it('keeps the first and last dot inside the track', () => {
    const clusters = clusterMarkers(markers, axis, 1000)
    expect(clusters[0]?.leftPct).toBeCloseTo(1.6)
    expect(clusters.at(-1)?.leftPct).toBeCloseTo(98.4)
  })

  it('clusters close markers on a narrow track and splits them on a wide one', () => {
    // 30 s apart: 5 px at 300 px wide (one dot), 50 px at 3000 px wide (two).
    expect(clusterMarkers(markers, axis, 300).map((c) => c.markers.length)).toEqual([1, 2, 1])
    expect(clusterMarkers(markers, axis, 3000).map((c) => c.markers.length)).toEqual([1, 1, 1, 1])
  })

  it('falls back to just past the last marker without a lecture length', () => {
    const lecture = { ...map.lectures[0]!, startMs: 600_000, durationMs: null }
    expect(lectureAxis(lecture, [at('a', 700_000)])).toEqual({ startMs: 600_000, endMs: 705_000 })
  })
})

describe('TaughtAt', () => {
  it('links each source moment with its excerpt (F2.4)', () => {
    const source = { lectureId: L1, idx: 3, startMs: 61_000, excerpt: 'arrays are contiguous' }
    act(() => root.render(<TaughtAt sources={[source]} />))
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe(`/lectures/${L1}?t=61000#transcript`)
    expect(link?.textContent).toContain('arrays are contiguous')
  })
})

describe('edgeHandles', () => {
  it('joins layers side to side and nodes in one layer top to bottom', () => {
    expect(edgeHandles({ x: 300, y: 0 }, { x: 0, y: 0 })).toEqual({
      sourceHandle: 'left',
      targetHandle: 'right',
    })
    expect(edgeHandles({ x: 0, y: 200 }, { x: 0, y: 0 })).toEqual({
      sourceHandle: 'top',
      targetHandle: 'bottom',
    })
    expect(edgeHandles({ x: 0, y: 0 }, { x: 0, y: 200 })).toEqual({
      sourceHandle: 'bottom',
      targetHandle: 'top',
    })
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
