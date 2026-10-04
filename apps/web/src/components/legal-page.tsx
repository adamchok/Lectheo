import Link from 'next/link'
import { Wordmark } from '@/components/wordmark'

interface LegalPageProps {
  title: string
  updated: string
  children: React.ReactNode
}

/** Shared shell for /privacy and /terms (public, no sign-in needed). */
export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-6 sm:px-6">
        <Link href="/" aria-label="Lectheo home">
          <Wordmark />
        </Link>
      </header>
      <main
        id="main"
        className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 sm:px-6 [&_a]:text-primary [&_a]:underline [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:font-serif [&_h2]:text-2xl [&_h2]:font-medium [&_li]:mt-1.5 [&_p]:mt-3 [&_p]:leading-relaxed [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6"
      >
        <h1 className="font-serif text-4xl font-medium tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2 text-sm">Last updated {updated}</p>
        {children}
      </main>
    </div>
  )
}
