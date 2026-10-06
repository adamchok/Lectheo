import { Menu } from 'lucide-react'
import Link from 'next/link'
import { SignInActions } from '@/components/sign-in/sign-in-actions'
import { Wordmark } from '@/components/wordmark'
import { CONTAINER } from './section'

export const NAV = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#practice', label: 'Practice' },
  { href: '#why-lectheo', label: 'Why Lectheo' },
  { href: '#faq', label: 'FAQ' },
] as const

const NAV_LINK =
  'text-body-sm text-muted-foreground hover:text-foreground rounded-sm transition-colors duration-fast'

/**
 * Sticky landing header (Design System §5). Below md: wordmark, the primary button and a native
 * <details> menu, so the menu needs no JavaScript.
 */
export function LandingHeader() {
  return (
    <header className="border-border bg-background/85 sticky top-0 z-sticky border-b backdrop-blur">
      <div className={`${CONTAINER} flex h-topbar items-center justify-between gap-2`}>
        <Link href="/" aria-label="Lectheo home" className="rounded-sm">
          <Wordmark />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className={NAV_LINK}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <SignInActions variant="header" />
          <details className="relative md:hidden">
            <summary
              aria-label="Menu"
              className="hover:bg-muted text-foreground flex size-9 cursor-pointer list-none items-center justify-center rounded-md [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden className="size-4" />
            </summary>
            <div className="bg-popover shadow-popover absolute top-full right-0 z-overlay mt-2 w-56 space-y-1 rounded-lg p-2">
              <nav aria-label="Sections, mobile" className="flex flex-col">
                {NAV.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className="text-body-sm hover:bg-muted flex h-9 items-center rounded-md px-3"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="border-border border-t pt-1">
                <SignInActions variant="menu" />
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>
  )
}
