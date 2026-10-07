'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { BookOpenText, FileText, Play, type LucideIcon } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useEffect } from 'react'
import { cn } from '@/lib/utils'

/* The lecture page's Study | Watch | Transcript switch (Design System §4 "Lecture: Study"). */

export type LectureMode = 'study' | 'watch' | 'transcript'

type ModeLecture = Pick<LectureResponse, 'id' | 'status' | 'source' | 'hasTimestamps'>

/** The map exists from map_ready on, so the Study brief does too (F9.1). */
export const hasMap = (l: Pick<LectureResponse, 'status'>): boolean =>
  l.status === 'map_ready' || l.status === 'ready'

/** Watch mode plays library videos and the student's own imported file. */
export const canWatch = (l: Pick<LectureResponse, 'source' | 'hasTimestamps'>): boolean =>
  l.hasTimestamps && (l.source === 'library' || l.source === 'import')

interface ModeLink {
  mode: LectureMode
  label: string
  icon: LucideIcon
  href: Route
}

function modeLinks(lecture: ModeLecture): ModeLink[] {
  const base = `/lectures/${lecture.id}`
  const map = hasMap(lecture)
  return [
    ...(map
      ? [{ mode: 'study' as const, label: 'Study', icon: BookOpenText, href: base as Route }]
      : []),
    ...(canWatch(lecture)
      ? [{ mode: 'watch' as const, label: 'Watch', icon: Play, href: `${base}/watch` as Route }]
      : []),
    {
      mode: 'transcript',
      label: 'Transcript',
      icon: FileText,
      href: (map ? `${base}?view=transcript` : base) as Route,
    },
  ]
}

const FOCUS_KEY = 'lectheo:mode-switched'

/**
 * Study and Transcript are the same route, so a switch remounts the view without the route-change
 * focus move: after a switch, focus the new view's h1 (WCAG 2.4.3) instead of leaving <body>.
 */
function useFocusAfterSwitch(): void {
  useEffect(() => {
    let switched = false
    try {
      switched = sessionStorage.getItem(FOCUS_KEY) === '1'
      sessionStorage.removeItem(FOCUS_KEY)
    } catch {
      return
    }
    if (!switched) return
    const heading = document.querySelector<HTMLElement>('main h1')
    if (!heading) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  }, [])
}

const markSwitch = (): void => {
  try {
    sessionStorage.setItem(FOCUS_KEY, '1')
  } catch {
    // Storage blocked: focus stays where the browser puts it.
  }
}

/** A segmented control of links; nothing when the lecture has only one mode. */
export function LectureModes({
  lecture,
  current,
  className,
}: {
  lecture: ModeLecture
  current: LectureMode
  className?: string
}) {
  const links = modeLinks(lecture)
  useFocusAfterSwitch()
  if (links.length < 2) return null
  return (
    <nav aria-label="Lecture view" className={className}>
      <ul className="border-input inline-flex gap-0.5 rounded-md border p-0.5 shadow-xs">
        {links.map(({ mode, label, icon: Icon, href }) => {
          const active = mode === current
          return (
            <li key={mode}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                onClick={active ? undefined : markSwitch}
                className={cn(
                  'text-body-sm inline-flex h-7 items-center gap-1.5 rounded-sm px-2.5 font-medium transition-colors duration-fast',
                  active
                    ? 'bg-accent text-accent-foreground inset-shadow-[0_-2px_0_0_var(--primary)]'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
