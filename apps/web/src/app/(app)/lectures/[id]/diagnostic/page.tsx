import { Id } from '@lectheo/contracts'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { DiagnosticView } from '@/components/lecture/diagnostic-view'

export const metadata: Metadata = { title: 'Diagnostic' }

export default async function DiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!Id.safeParse(id).success) notFound()
  return <DiagnosticView lectureId={id} />
}
