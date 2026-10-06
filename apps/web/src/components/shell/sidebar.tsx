'use client'

import type { CourseSummary, MeResponse } from '@lectheo/contracts'
import {
  BookOpen,
  FolderOpen,
  House,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  type LucideIcon,
} from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCourseMap, useCourses } from '@/client/queries'
import { AccountMenu } from '@/components/account-menu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { LogoMark, Wordmark } from '@/components/wordmark'
import { FEATURES } from '@/lib/features'
import { cn } from '@/lib/utils'
import { useShell } from './shell-context'

interface NavItemProps {
  href: Route
  label: string
  icon?: LucideIcon
  active: boolean
  collapsed: boolean
  /** Lecture rows: indented, number + title, full title in a tooltip. */
  nested?: boolean
  onNavigate?: () => void
}

function NavItem({ href, label, icon: Icon, active, collapsed, nested, onNavigate }: NavItemProps) {
  const link = (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'text-body-sm flex h-8 min-w-0 items-center gap-3 rounded-sm px-3 transition-colors duration-fast',
        nested && 'pl-10',
        collapsed && 'justify-center px-0',
        active
          ? // A fill alone is about 1.1:1, so the 2px primary edge carries the state (≥ 3:1).
            'bg-sidebar-active text-sidebar-active-foreground font-semibold inset-shadow-[2px_0_0_0_var(--primary)]'
          : 'text-sidebar-foreground hover:bg-muted',
      )}
    >
      {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
      <span className={cn('truncate', collapsed && 'sr-only')}>{label}</span>
    </Link>
  )
  if (!collapsed && !nested) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

const courseIdFromPath = (pathname: string) => pathname.match(/^\/courses\/([^/]+)/)?.[1] ?? null

/** Library first, then the student's own courses in API order. */
const sortCourses = (courses: readonly CourseSummary[]) =>
  [...courses].sort((a, b) => Number(b.kind === 'library') - Number(a.kind === 'library'))

interface CourseLecturesProps {
  courseId: string
  pathname: string
  onNavigate?: () => void
}

function CourseLectures({ courseId, pathname, onNavigate }: CourseLecturesProps) {
  const map = useCourseMap(courseId)
  if (!map.data) return null
  const lectures = [...map.data.lectures].sort((a, b) => a.seq - b.seq)
  if (lectures.length === 0) return null
  return (
    <ul aria-label={`${map.data.course.title} lectures`} className="space-y-0.5 py-0.5">
      {lectures.map((lecture) => {
        const href = `/lectures/${lecture.id}`
        return (
          <li key={lecture.id}>
            <NavItem
              href={href as Route}
              label={`${lecture.seq} · ${lecture.title}`}
              active={pathname === href || pathname.startsWith(`${href}/`)}
              collapsed={false}
              nested
              onNavigate={onNavigate}
            />
          </li>
        )
      })}
    </ul>
  )
}

export interface SidebarProps {
  me: MeResponse | undefined
  collapsed: boolean
  /** Desktop only; the phone sheet is always expanded. */
  onToggleCollapsed?: () => void
  /** Phone sheet: close it after a link is followed. */
  onNavigate?: () => void
}

/** App sidebar (Design System §4): wordmark, Home, New lecture, Courses, account card. */
export function Sidebar({ me, collapsed, onToggleCollapsed, onNavigate }: SidebarProps) {
  const pathname = usePathname()
  const courses = useCourses()
  const pageCourseId = useShell()?.pageCourseId ?? null
  const currentCourseId = courseIdFromPath(pathname) ?? pageCourseId
  const item = { collapsed, onNavigate }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn('flex h-topbar shrink-0 items-center', collapsed ? 'justify-center' : 'px-4')}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          aria-label="Lectheo, go to Home"
          className="rounded-sm"
        >
          {collapsed ? <LogoMark className="text-primary" /> : <Wordmark />}
        </Link>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 py-2">
        <ul className="space-y-0.5">
          <li>
            <NavItem
              href="/dashboard"
              label="Home"
              icon={House}
              active={pathname === '/dashboard'}
              {...item}
            />
          </li>
          {FEATURES.addLecture && (
            <li>
              <NavItem
                href="/lectures/new"
                label="New lecture"
                icon={Plus}
                active={pathname === '/lectures/new'}
                {...item}
              />
            </li>
          )}
        </ul>

        <div className="space-y-1">
          <h2 className={cn('text-overline text-muted-foreground px-3', collapsed && 'sr-only')}>
            Courses
          </h2>
          {courses.isPending ? (
            <Skeleton label="Loading courses" className="space-y-1.5 px-3 py-1">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </Skeleton>
          ) : (
            <ul className="space-y-0.5">
              {sortCourses(courses.data ?? []).map((course) => {
                const href = `/courses/${course.id}`
                const current = course.id === currentCourseId
                return (
                  <li key={course.id}>
                    <NavItem
                      href={href as Route}
                      label={course.title}
                      icon={course.kind === 'library' ? BookOpen : FolderOpen}
                      active={pathname === href}
                      {...item}
                    />
                    {current && !collapsed && (
                      <CourseLectures
                        courseId={course.id}
                        pathname={pathname}
                        onNavigate={onNavigate}
                      />
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </nav>

      <div className="border-border shrink-0 space-y-1 border-t p-2">
        {onToggleCollapsed && (
          <Button
            variant="ghost"
            size={collapsed ? 'icon-sm' : 'sm'}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={cn(
              'text-muted-foreground',
              collapsed ? 'mx-auto flex' : 'w-full justify-start px-3',
            )}
          >
            {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            {!collapsed && 'Collapse'}
          </Button>
        )}
        {me ? (
          <AccountMenu me={me} collapsed={collapsed} />
        ) : (
          <Skeleton label="Loading account" className="h-12 w-full rounded-md" />
        )}
      </div>
    </div>
  )
}
