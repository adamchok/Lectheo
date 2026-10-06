'use client'

import { Menu } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { isApiClientError } from '@/client/api'
import { useMe, useSignOut } from '@/client/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ShellProvider, useShell } from './shell/shell-context'
import { Sidebar } from './shell/sidebar'
import { SIDEBAR_COOKIE } from './shell/sidebar-cookie'
import { SkipLink } from './skip-link'

const ONE_YEAR_S = 60 * 60 * 24 * 365

function rememberCollapsed(collapsed: boolean) {
  document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? 'rail' : 'full'}; path=/; max-age=${ONE_YEAR_S}; samesite=lax`
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const shell = useShell()
  return (
    <header className="bg-background/85 border-border sticky top-0 z-sticky border-b backdrop-blur">
      <div className="mx-auto flex h-topbar w-full max-w-content items-center gap-2 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-1.5 lg:hidden"
          aria-label="Open navigation"
          onClick={onOpenMenu}
        >
          <Menu aria-hidden />
        </Button>
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
  const [sheetOpen, setSheetOpen] = useState(false)

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
    setCollapsed((was) => {
      rememberCollapsed(!was)
      return !was
    })
  }

  return (
    <ShellProvider>
      <SkipLink />
      <div className="flex min-h-dvh">
        <div
          className={cn(
            'bg-sidebar border-border sticky top-0 hidden h-dvh shrink-0 border-r lg:block',
            collapsed ? 'w-sidebar-rail' : 'w-sidebar',
          )}
        >
          <Sidebar
            me={me.data}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            layoutGroup="desktop"
          />
        </div>

        <DialogPrimitive.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="bg-background/80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-overlay lg:hidden" />
            <DialogPrimitive.Content
              aria-describedby={undefined}
              className="bg-sidebar border-border shadow-popover data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left duration-slow fixed inset-y-0 left-0 z-overlay w-sidebar max-w-[85vw] border-r lg:hidden"
            >
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <Sidebar
                me={me.data}
                collapsed={false}
                onNavigate={() => setSheetOpen(false)}
                layoutGroup="sheet"
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMenu={() => setSheetOpen(true)} />
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
    </ShellProvider>
  )
}
