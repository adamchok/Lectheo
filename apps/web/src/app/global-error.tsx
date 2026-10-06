'use client'

import './globals.css'

/**
 * Last-resort boundary when the root layout itself fails; renders its own <html>. It imports the
 * tokens itself, so it follows the OS theme (prefers-color-scheme) without the theme script.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground grid min-h-dvh place-items-center p-4 font-sans">
        <main className="max-w-[26rem] space-y-3 text-center">
          <h1 className="text-title-lg">Lectheo hit a problem</h1>
          <p className="text-body text-muted-foreground">
            Please reload the page. If it keeps happening, try again in a few minutes.
          </p>
          <button
            type="button"
            onClick={reset}
            className="border-input bg-card text-body-sm h-9 rounded-md border px-4 font-semibold shadow-xs"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
