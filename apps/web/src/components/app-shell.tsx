'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, type ReactNode } from 'react'
import { isApiClientError } from '@/client/api'
import { useCourses, useMe, useSignOut } from '@/client/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { AccountMenu } from './account-menu'
import { SkipLink } from './skip-link'
import { Wordmark } from './wordmark'

interface NavItem {
  href: Route
  label: string
  isActive: (pathname: string) => boolean
}

function useNavItems(): NavItem[] {
  const courses = useCourses()
  const library = courses.data?.find((course) => course.kind === 'library')
  const items: NavItem[] = [
    { href: '/dashboard', label: 'Dashboard', isActive: (p) => p === '/dashboard' },
  ]
  if (library) {
    const href = `/courses/${library.id}` as Route
    items.push({ href, label: 'Library', isActive: (p) => p.startsWith(href) })
  }
  return items
}

/** Signed-in chrome: skip link, top bar (wordmark, nav, account menu) and <main>. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const me = useMe()
  const navItems = useNavItems()

  const { mutate: endSession } = useSignOut()
  const unauthenticated = isApiClientError(me.error) && me.error.status === 401
  useEffect(() => {
    if (!unauthenticated) return
    // A live session without a profile (a purged sample) is 401 here but signed in to the proxy,
    // which would send `/` straight back: clear the session cookies first, then leave.
    endSession(undefined, { onSettled: () => router.replace('/') })
  }, [unauthenticated, endSession, router])

  // A client-side navigation unmounts the link that was clicked and drops focus to <body>; start
  // the next keyboard step at <main> instead (WCAG 2.4.3). Pages that focus something themselves
  // run their effects first, so this only fills the gap.
  const main = useRef<HTMLElement>(null)
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (pathname === lastPath.current) return
    lastPath.current = pathname
    if (document.activeElement === document.body) main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="border-border/80 bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/dashboard" className="rounded-md" aria-label="Lectheo, go to dashboard">
            <Wordmark />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = item.isActive(pathname)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me.data ? (
              <AccountMenu me={me.data} />
            ) : (
              <Skeleton className="h-8 w-32 rounded-full" aria-label="Loading account" />
            )}
          </div>
        </div>
      </header>
      <main
        ref={main}
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:py-10"
      >
        {children}
      </main>
    </div>
  )
}
