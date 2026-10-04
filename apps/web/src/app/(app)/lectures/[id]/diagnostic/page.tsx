import type { Metadata } from 'next'
import { DiagnosticView } from '@/components/lecture/diagnostic-view'

export const metadata: Metadata = { title: 'Diagnostic' }

export default async function DiagnosticPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <DiagnosticView lectureId={id} />
}
