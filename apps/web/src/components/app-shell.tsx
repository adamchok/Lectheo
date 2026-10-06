'use client'

import { Menu } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { isApiClientError } from '@/client/api'
import { useMe, useSignOut } from '@/client/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ShellProvider, useShell } from './shell/shell-context'
import { Sidebar } from './shell/sidebar'
import { SIDEBAR_COOKIE } from './shell/sidebar-cookie'
import { SkipLink } from './skip-link'

const ONE_YEAR_S = 60 * 60 * 24 * 365
/** Where the sidebar stops being a sheet (Tailwind `lg`). */
const DESKTOP_QUERY = '(min-width: 1024px)'

function rememberCollapsed(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? 'rail' : 'full'}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`
}

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const isDesktopNow = () => window.matchMedia(DESKTOP_QUERY).matches

function TopBar() {
  const shell = useShell()
  return (
    <header className="bg-background/85 border-border sticky top-0 z-sticky border-b backdrop-blur">
      <div className="mx-auto flex h-topbar w-full max-w-content items-center gap-2 px-4 sm:px-6">
        {/* A real Trigger: Radix sets aria-expanded and returns focus here on close (2.4.3). */}
        <DialogPrimitive.Trigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-1.5 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu aria-hidden />
          </Button>
        </DialogPrimitive.Trigger>
        <div ref={shell?.setCrumbsSlot} className="flex min-w-0 flex-1 items-center" />
        <div ref={shell?.setActionsSlot} className="flex shrink-0 items-center gap-2" />
      </div>
    </header>
  )
}

/**
 * Signed-in chrome (Design System §4): skip link, sidebar (a rail when collapsed, an off-canvas
 * sheet below 1024px), sticky top bar with breadcrumbs and page actions, and <main>.
 */
export function AppShell({
  children,
  initialCollapsed = false,
}: {
  children: ReactNode
  initialCollapsed?: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()
  const me = useMe()
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  // The sheet belongs to the page it was opened on: any route change (a link, Reset sample's
  // replace, browser back) closes it, and so does widening past 1024px, where it would otherwise
  // stay modal while hidden.
  const [sheetPath, setSheetPath] = useState<string | null>(null)
  const isDesktop = useSyncExternalStore(subscribeDesktop, isDesktopNow, () => false)
  const sheetOpen = sheetPath === pathname && !isDesktop

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

  const toggleCollapsed = () => {
    const next = !collapsed
    setCollapsed(next)
    rememberCollapsed(next)
  }

  /**
   * Closing returns focus to the menu button, except after a navigation (the new page starts at
   * <main>) and on the watch page, where focus on <main> keeps the L / I shortcuts live.
   */
  const followedLink = useRef(false)
  const onCloseAutoFocus = (event: Event) => {
    const navigated = followedLink.current || window.location.pathname !== pathname
    followedLink.current = false
    if (!navigated && !pathname.endsWith('/watch')) return
    event.preventDefault()
    main.current?.focus({ preventScroll: true })
  }
  const closeForLink = () => {
    followedLink.current = true
    setSheetPath(null)
  }

  return (
    <ShellProvider>
      <SkipLink />
      <DialogPrimitive.Root
        open={sheetOpen}
        onOpenChange={(open) => setSheetPath(open ? pathname : null)}
      >
        <div className="flex min-h-dvh">
          <div
            className={cn(
              'bg-sidebar border-border sticky top-0 hidden h-dvh shrink-0 border-r lg:block',
              collapsed ? 'w-sidebar-rail' : 'w-sidebar',
            )}
          >
            <Sidebar me={me.data} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          </div>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="bg-background/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-overlay lg:hidden" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              onCloseAutoFocus={onCloseAutoFocus}
              className="bg-sidebar border-border shadow-popover data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left duration-slow fixed inset-y-0 left-0 z-overlay w-sidebar max-w-[85vw] border-r lg:hidden"
            >
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Sidebar me={me.data} collapsed={false} onNavigate={closeForLink} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>

          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            <main
              ref={main}
              id="main"
              tabIndex={-1}
              className="mx-auto w-full max-w-content flex-1 px-4 py-6 sm:px-6 lg:py-8"
            >
              {children}
            </main>
          </div>
        </div>
      </DialogPrimitive.Root>
    </ShellProvider>
  )
}
