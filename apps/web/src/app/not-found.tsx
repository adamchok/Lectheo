import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Wordmark } from '@/components/wordmark'

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-4 text-center"
    >
      <Wordmark />
      <div className="space-y-2">
        <p className="text-muted-foreground font-mono text-sm">404</p>
        <h1 className="font-serif text-3xl font-medium">This page doesn&apos;t exist</h1>
        <p className="text-muted-foreground">The link may be old, or the page has moved.</p>
      </div>
      <Button asChild>
        <Link href="/">Go to Lectheo</Link>
      </Button>
    </main>
  )
}
