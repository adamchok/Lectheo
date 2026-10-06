import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell'
import { SIDEBAR_COOKIE } from '@/components/shell/sidebar-cookie'

// Signed-in pages are private: keep them out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } }

/** Signed-in area. Session refresh lives in src/proxy.ts; AppShell also sends a 401 back to '/'. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'rail'
  return <AppShell initialCollapsed={collapsed}>{children}</AppShell>
}
