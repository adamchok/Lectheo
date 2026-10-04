import type { ReactNode } from 'react'
import { AppShell } from '@/components/app-shell'

/** Signed-in area. Session refresh lives in src/proxy.ts; AppShell also sends a 401 back to '/'. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>
}
