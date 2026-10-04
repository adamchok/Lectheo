import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Lectheo',
  description: 'Find what you missed. Prove what you know.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
