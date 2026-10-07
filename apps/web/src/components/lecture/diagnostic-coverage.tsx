'use client'

import type { DiagnosticResultsResponse } from '@lectheo/contracts'
import { MAX_REST_ITEMS } from '@lectheo/domain'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { pluralize } from '@/client/format'
import { queryKeys } from '@/client/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Coverage = DiagnosticResultsResponse['coverage']

/**
 * F3.10–F3.11: "Tested 6 of 14 concepts", a thin bar (one segment per concept), the per-chapter
 * counts and the concepts with no checked question.
 */
export function CoverageSummary({ coverage }: { coverage: Coverage }) {
  const { tested, total, noQuestion, byChapter } = coverage
  if (total === 0) return null
  return (
    <section aria-label="Coverage" className="space-y-2">
      <p className="text-body">
        Tested {tested} of {pluralize(total, 'concept')}
      </p>
      <div aria-hidden className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={cn('flex-1', i < tested ? 'bg-primary' : 'bg-muted')} />
        ))}
      </div>
      {byChapter.length > 0 && (
        <ul className="text-caption text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
          {byChapter.map((c, i) => (
            <li key={c.chapterId} title={c.title}>
              Chapter {i + 1} · {c.tested} of {c.total} tested
            </li>
          ))}
        </ul>
      )}
      {noQuestion > 0 && (
        <p className="text-caption text-muted-foreground">
          {pluralize(noQuestion, 'concept')}: No checked question yet
        </p>
      )}
    </section>
  )
}

/** "Test the other N →": a new round on the untested concepts (at most 8 per round). */
export function TestRestButton({ lectureId, untested }: { lectureId: string; untested: number }) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const handleClick = () => {
    // Same URL after a rest round: drop the finished session so the page plans a new one.
    void queryClient.resetQueries({ queryKey: queryKeys.diagnosticStart(lectureId, 'rest') })
    router.push(`/lectures/${lectureId}/diagnostic?round=rest` as Route)
  }
  return (
    <Button variant="outline" onClick={handleClick}>
      {untested > MAX_REST_ITEMS ? `Test ${MAX_REST_ITEMS} more` : `Test the other ${untested}`}
      <ArrowRight aria-hidden />
    </Button>
  )
}
