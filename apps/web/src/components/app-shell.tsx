'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { isApiClientError } from '@/client/api'
import { useCourses, useMe } from '@/client/queries'
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

  const unauthenticated = isApiClientError(me.error) && me.error.status === 401
  useEffect(() => {
    if (unauthenticated) router.replace('/')
  }, [unauthenticated, router])

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
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none sm:px-6 lg:py-10"
      >
        {children}
      </main>
    </div>
  )
}
