import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { SignInActions } from '@/components/sign-in/sign-in-actions'
import { Wordmark } from '@/components/wordmark'
import { NAV } from './landing-header'
import { CONTAINER } from './section'

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-title" className="bg-sunken border-border border-t">
      <div className={`${CONTAINER} space-y-6 py-16 lg:py-24`}>
        <h2 id="final-cta-title" className="text-display-md text-balance">
          See what you&apos;ve been missing.
        </h2>
        <SignInActions />
        <p className="text-caption text-muted-foreground">Takes about two minutes. No sign-up.</p>
      </div>
    </section>
  )
}

const FOOTER_LINK = 'hover:text-foreground rounded-sm underline-offset-4 hover:underline'

export function LandingFooter() {
  return (
    <footer className="border-border border-t">
      <div className={`${CONTAINER} text-caption text-muted-foreground space-y-8 py-10`}>
        <div className="flex flex-wrap items-start justify-between gap-8">
          <Wordmark />
          <div className="flex flex-wrap gap-12">
            <nav aria-label="Product">
              <ul className="space-y-2">
                {NAV.map((item) => (
                  <li key={item.href}>
                    <a href={item.href} className={FOOTER_LINK}>
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label="Legal">
              <ul className="space-y-2">
                <li>
                  <Link href="/privacy" className={FOOTER_LINK}>
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className={FOOTER_LINK}>
                    Terms
                  </Link>
                </li>
                <li>
                  <a
                    href="https://github.com/adamchok/Lectheo"
                    className={`${FOOTER_LINK} inline-flex items-center gap-1`}
                  >
                    GitHub
                    <ArrowUpRight aria-hidden className="size-4" />
                  </a>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="border-border space-y-2 border-t pt-6">
          <p>
            Sample lectures from CS50x 2026 by Harvard University (Fall 2025 recordings), CC
            BY-NC-SA 4.0. Not affiliated with or endorsed by CS50.
          </p>
          <p>
            Lectheo: <em>lectio</em>, a reading, + <em>theōria</em>, seeing.
          </p>
          <p>© 2026 Adam Chok</p>
        </div>
      </div>
    </footer>
  )
}
