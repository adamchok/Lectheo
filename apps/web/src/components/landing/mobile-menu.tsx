'use client'

import { Menu } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

const MENU_ID = 'landing-menu'

/** Closes the menu when a section link is followed, so it doesn't cover where you jumped to. */
function closeOnLink(event: MouseEvent<HTMLDivElement>): void {
  if (event.target instanceof Element && event.target.closest('a')) {
    event.currentTarget.hidePopover()
  }
}

/**
 * Below md: a native popover menu. The browser handles Escape, outside clicks and focus return;
 * this component only closes it when a link inside is followed.
 */
export function MobileMenu({ children }: { children: ReactNode }) {
  return (
    <>
      <button
        type="button"
        popoverTarget={MENU_ID}
        aria-label="Menu"
        className="hover:bg-muted text-foreground flex size-9 items-center justify-center rounded-md md:hidden"
      >
        <Menu aria-hidden className="size-4" />
      </button>
      {/* No display utilities here: they would override the closed popover's display:none. */}
      <div
        id={MENU_ID}
        popover="auto"
        onClick={closeOnLink}
        className="bg-popover text-popover-foreground shadow-popover top-topbar fixed inset-auto right-4 m-0 mt-2 w-56 space-y-1 rounded-lg border-0 p-2"
      >
        {children}
      </div>
    </>
  )
}
