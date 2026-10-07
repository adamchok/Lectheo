'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/*
 * The Study brief's outline (Product Spec F9.11, Design System §4 "Lecture: Study"): a sticky
 * rail of chapters on desktop, a sticky "Jump to" select on phones. It highlights the section in
 * view; that is where you are, not progress (F9.6).
 */

export interface OutlineEntry {
  /** The section's element id. */
  id: string
  number: number
  title: string
  /** "3 min read", "Revisits 2 concepts" or "No concepts". */
  caption: string
  /** Nothing to read here (greyed). */
  empty: boolean
}

/** The band of the viewport that decides which section is "in view". */
const IN_VIEW_MARGIN = '-20% 0px -70% 0px'

export interface SectionInView {
  active: string | null
  /** Marks a jumped-to section as current while it stays on screen. */
  pin: (id: string) => void
}

/**
 * The first section crossing the band near the top of the viewport; the last one seen stays.
 * The last chapters can't scroll up to the band, so a jump pins its target until that section
 * leaves the viewport (by position, so screen-reader browsing and Tab don't drop it).
 */
export function useSectionInView(ids: readonly string[]): SectionInView {
  const [active, setActive] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  useEffect(() => {
    const el = pinned ? document.getElementById(pinned) : null
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry && !entry.isIntersecting) setPinned(null)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [pinned])
  const key = ids.join(' ')
  useEffect(() => {
    const order = key.split(' ').filter(Boolean)
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        const first = order.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      { rootMargin: IN_VIEW_MARGIN },
    )
    order.forEach((id) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [key])
  return { active: pinned ?? active ?? ids[0] ?? null, pin: setPinned }
}

export interface StudyOutlineProps {
  entries: readonly OutlineEntry[]
  inView: SectionInView
  /** Test me, at the rail's foot. */
  footer: ReactNode
}

export function StudyOutline({ entries, inView, footer }: StudyOutlineProps) {
  return (
    <nav
      aria-label="Outline"
      className="border-border sticky top-[calc(var(--topbar-height)+1.5rem)] max-h-[calc(100dvh-var(--topbar-height)-3rem)] space-y-6 overflow-y-auto border-r pr-4"
    >
      {/* role="list": Safari drops list semantics when list-style is none. */}
      <ol role="list" className="space-y-1">
        {entries.map((e) => {
          const current = e.id === inView.active
          return (
            <li key={e.id} className={cn('relative rounded-md', current && 'bg-accent')}>
              {current && (
                <span
                  aria-hidden
                  className="bg-primary absolute inset-y-1 left-0 w-0.5 rounded-full"
                />
              )}
              <a
                href={`#${e.id}`}
                aria-current={current ? 'location' : undefined}
                onClick={(event) => {
                  // A modified click opens a new tab or window: this page doesn't move.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
                  inView.pin(e.id)
                }}
                className={cn(
                  'hover:bg-accent block rounded-md px-3 py-2 transition-colors',
                  e.empty && 'text-muted-foreground',
                )}
              >
                <span className="text-body-sm block">
                  <span className="text-muted-foreground tabular-nums">{e.number}</span> {e.title}
                </span>
                <span className="text-caption text-muted-foreground block">{e.caption}</span>
              </a>
            </li>
          )
        })}
      </ol>
      <div>{footer}</div>
    </nav>
  )
}

export interface JumpToProps {
  entries: readonly OutlineEntry[]
  inView: SectionInView
}

export function JumpTo({ entries, inView }: JumpToProps) {
  const id = useId()
  return (
    // data-jump-to: globals.css keeps focused content clear of this bar (WCAG 2.4.11).
    <div
      data-jump-to
      className="bg-background z-sticky top-topbar border-border sticky mb-6 flex items-center gap-2 border-b py-2"
    >
      <label htmlFor={id} className="text-body-sm text-muted-foreground shrink-0">
        Jump to
      </label>
      <select
        id={id}
        value={inView.active ?? ''}
        onChange={(event) => {
          // Scroll only: arrow keys fire `change` on a closed select, so moving focus here would
          // throw a keyboard user out of the menu after one step (WCAG 3.2.2).
          inView.pin(event.target.value)
          document.getElementById(event.target.value)?.scrollIntoView({ block: 'start' })
        }}
        className="border-input bg-background text-body-sm h-9 min-w-0 flex-1 rounded-md border px-2"
      >
        {entries.map((e) => (
          <option key={e.id} value={e.id}>
            {e.number}. {e.title} · {e.caption}
          </option>
        ))}
      </select>
    </div>
  )
}
