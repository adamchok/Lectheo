'use client'

/** Last-resort boundary when the root layout itself fails; renders its own <html>. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'grid',
          placeItems: 'center',
          minHeight: '100dvh',
          margin: 0,
          background: '#fbfaf7',
          color: '#1c1d22',
        }}
      >
        <main style={{ textAlign: 'center', maxWidth: 420, padding: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 500 }}>Lectheo hit a problem</h1>
          <p style={{ color: '#5d5f68' }}>
            Please reload the page. If it keeps happening, try again in a few minutes.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #d6d3cb',
              background: '#fff',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
