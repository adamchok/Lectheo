import { Flag, MessagesSquare, ShieldQuestion } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { KeyHint } from '@/components/key-hint'
import { ProductPreview } from '@/components/sign-in/product-preview'
import { SignInActions } from '@/components/sign-in/sign-in-actions'
import { SkipLink } from '@/components/skip-link'
import { Wordmark } from '@/components/wordmark'

export const metadata: Metadata = {
  title: { absolute: 'Lectheo · Find what you missed. Prove what you know.' },
}

const STEPS = [
  {
    icon: Flag,
    title: 'Mark while you watch',
    body: (
      <>
        Press <KeyHint>L</KeyHint> when you&apos;re lost and <KeyHint>I</KeyHint> when it matters.
        No rewatching.
      </>
    ),
  },
  {
    icon: ShieldQuestion,
    title: 'Find the gaps you don’t feel',
    body: 'Rate your confidence before you answer. Sure but wrong, twice, is a confident mistake.',
  },
  {
    icon: MessagesSquare,
    title: 'Prove it two ways',
    body: 'Spot the flaw in a near-right explanation, then teach it back. Green means you showed it.',
  },
] as const

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-6">
        <Wordmark />
        <span className="text-muted-foreground text-xs">
          <span className="sr-only">Pronounced </span>LEK-thee-oh
        </span>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center overflow-x-clip gap-14 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:pt-16 lg:pb-24">
          <div className="max-w-xl space-y-8">
            <div className="space-y-5">
              <p className="text-primary text-xs font-semibold tracking-[0.1em] uppercase">
                AI study partner for CS lectures
              </p>
              <h1 className="font-serif text-[2.75rem] leading-[1.05] font-medium tracking-[-0.02em] text-balance sm:text-6xl">
                Find what you missed. <em className="text-primary font-normal">Prove</em> what you
                know.
              </h1>
              <p className="text-muted-foreground max-w-lg text-lg leading-relaxed text-pretty">
                Lectheo uses your lecture to find what you personally don&apos;t understand, then
                makes you reason with it instead of just recalling it.
              </p>
            </div>
            <SignInActions />
            <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
              The sample account is yours alone: a student partway through CS50x, with Lecture 5
              ready to watch. It&apos;s deleted after 24 hours.
            </p>
          </div>
          <ProductPreview />
        </section>

        <section aria-labelledby="how-it-works" className="border-border bg-sunken border-t">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="how-it-works" className="sr-only">
              How it works
            </h2>
            <ol className="grid gap-10 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="space-y-2">
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <span className="text-primary font-mono text-xs font-medium">0{index + 1}</span>
                    <step.icon aria-hidden className="size-4" />
                  </div>
                  <h3 className="font-serif text-xl font-medium">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed text-pretty">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap justify-between gap-2 px-4 py-6 text-xs sm:px-6">
          <p>
            Lectheo: <em>lectio</em>, a reading + <em>theōria</em>, seeing.
          </p>
          <p>No points, no streaks. Just what you understand.</p>
          <nav aria-label="Legal" className="flex gap-4">
            <Link
              href="/privacy"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
