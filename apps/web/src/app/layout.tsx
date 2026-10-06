import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Newsreader, Source_Sans_3 } from 'next/font/google'
import type { ReactNode } from 'react'
import { Providers } from '@/components/providers'
import { siteUrl } from '@/lib/site'
import './globals.css'

// UI: Source Sans 3 (humanist, highly legible at small sizes).
const ui = Source_Sans_3({ subsets: ['latin'], variable: '--font-ui', display: 'swap' })
// Display: Newsreader (calm, academic serif) for the wordmark and page titles.
const display = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  style: ['normal', 'italic'],
})
// Code & timestamps: JetBrains Mono (tabular digits for "12:41").
const code = JetBrains_Mono({ subsets: ['latin'], variable: '--font-code', display: 'swap' })

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: 'Lectheo', template: '%s · Lectheo' },
  description:
    'Find what you missed. Prove what you know. Lectheo uses your lecture to find what you personally don’t understand, then makes you reason with it.',
  applicationName: 'Lectheo',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf7' },
    { media: '(prefers-color-scheme: dark)', color: '#121317' },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${ui.variable} ${display.variable} ${code.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
