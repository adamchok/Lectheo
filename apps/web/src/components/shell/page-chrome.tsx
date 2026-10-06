'use client'

import { ChevronRight } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { Fragment, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useShell } from './shell-context'

export interface Crumb {
  label: string
  /** Omitted on the last crumb (the current page). */
  href?: Route
}

export interface PageChromeProps {
  /** Real names, outermost first: Course › Lecture 5 › Spot the flaw (Design System §4). */
  crumbs: readonly Crumb[]
  /** The page's actions, shown on the right of the top bar (map/list toggle, Delete lecture). */
  actions?: ReactNode
  /** The course this page belongs to: the sidebar expands it to its lectures. */
  courseId?: string
  /** Browser tab title; defaults to the last crumb. */
  title?: string
}

function Breadcrumbs({ crumbs }: { crumbs: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="text-body-sm flex min-w-0 items-center gap-1">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={`${i}-${crumb.label}`}>
              {/* Phones keep only the current page; the sidebar sheet has the rest. */}
              <li className={last ? 'flex min-w-0' : 'hidden min-w-0 shrink sm:flex'}>
                {last || !crumb.href ? (
                  <span
                    aria-current={last ? 'page' : undefined}
                    className={last ? 'text-foreground truncate font-semibold' : 'truncate'}
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-muted-foreground hover:text-foreground truncate rounded-sm transition-colors"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-muted-foreground hidden shrink-0 sm:flex">
                  <ChevronRight className="size-4" />
                </li>
              )}
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Puts a page's breadcrumbs and actions into the sticky top bar, tells the sidebar which course
 * is current, and names the browser tab. Renders nothing in place.
 */
export function PageChrome({ crumbs, actions, courseId, title }: PageChromeProps) {
  const shell = useShell()
  const setPageCourseId = shell?.setPageCourseId
  const tabTitle = title ?? crumbs.at(-1)?.label

  useEffect(() => {
    if (!setPageCourseId || !courseId) return
    setPageCourseId(courseId)
    return () => setPageCourseId(null)
  }, [setPageCourseId, courseId])

  // Data-driven names arrive after the route's static metadata, which (on a dynamic route) can
  // stream in after this effect: re-assert the title whenever <head> changes.
  useEffect(() => {
    if (!tabTitle) return
    const wanted = `${tabTitle} · Lectheo`
    const apply = () => {
      if (document.title !== wanted) document.title = wanted
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.head, { subtree: true, childList: true, characterData: true })
    return () => observer.disconnect()
  }, [tabTitle])

  if (!shell) return null
  return (
    <>
      {shell.crumbsSlot && createPortal(<Breadcrumbs crumbs={crumbs} />, shell.crumbsSlot)}
      {shell.actionsSlot && actions && createPortal(actions, shell.actionsSlot)}
    </>
  )
}
