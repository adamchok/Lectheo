import { Id } from '@lectheo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DiagnosticView } from '@/components/lecture/diagnostic-view'

export const metadata: Metadata = { title: 'Diagnostic' }

interface DiagnosticPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ round?: string | string[] }>
}

export default async function DiagnosticPage({ params, searchParams }: DiagnosticPageProps) {
  const [{ id }, { round }] = await Promise.all([params, searchParams])
  if (!Id.safeParse(id).success) notFound()
  // F3.10: ?round=rest is a "Test the rest" round; anything else is the core diagnostic.
  return <DiagnosticView lectureId={id} round={round === 'rest' ? 'rest' : 'core'} />
}
