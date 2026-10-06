'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

/** DOM slots in the top bar that pages portal into, plus the course the page belongs to. */
interface ShellState {
  crumbsSlot: HTMLElement | null
  actionsSlot: HTMLElement | null
  setCrumbsSlot: (el: HTMLElement | null) => void
  setActionsSlot: (el: HTMLElement | null) => void
  /** Course of the current lecture/activity page, so the sidebar can expand it. */
  pageCourseId: string | null
  setPageCourseId: (id: string | null) => void
}

const ShellContext = createContext<ShellState | null>(null)

export function ShellProvider({ children }: { children: ReactNode }) {
  const [crumbsSlot, setCrumbsSlot] = useState<HTMLElement | null>(null)
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null)
  const [pageCourseId, setPageCourseId] = useState<string | null>(null)
  return (
    <ShellContext
      value={{
        crumbsSlot,
        actionsSlot,
        setCrumbsSlot,
        setActionsSlot,
        pageCourseId,
        setPageCourseId,
      }}
    >
      {children}
    </ShellContext>
  )
}

/** Null outside the app shell (component tests): chrome then renders nothing. */
export function useShell(): ShellState | null {
  return useContext(ShellContext)
}
