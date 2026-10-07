'use client'

import type { DiagnosticResultsResponse } from '@lectheo/contracts'
import { MAX_REST_ITEMS } from '@lectheo/domain'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { pluralize } from '@/client/format'
import { queryKeys } from '@/client/queries'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Coverage = DiagnosticResultsResponse['coverage']

/** Past this many concepts the bar drops its gaps, so segments stay visible at 375px. */
const GAPPED_SEGMENTS_MAX = 24

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
      <div
        aria-hidden
        className={cn(
          'flex h-1.5 overflow-hidden rounded-full',
          total > GAPPED_SEGMENTS_MAX ? 'gap-px' : 'gap-0.5',
        )}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={cn('flex-1', i < tested ? 'bg-primary' : 'bg-muted-foreground/30')}
          />
        ))}
      </div>
      {byChapter.length > 0 && (
        <ul
          role="list"
          className="text-caption text-muted-foreground flex flex-wrap gap-x-4 gap-y-1"
        >
          {byChapter.map((c) => (
            <li key={c.chapterId} title={c.title}>
              Chapter {c.number}
              <span className="sr-only">: {c.title}</span> · {c.tested} of {c.total} tested
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

function restLabel(untested: number): { text: string; srSuffix: string } {
  if (untested === 1) return { text: 'Test the last one', srSuffix: '' }
  if (untested > MAX_REST_ITEMS)
    return { text: `Test ${MAX_REST_ITEMS} more`, srSuffix: ' concepts' }
  return { text: `Test the other ${untested}`, srSuffix: ' concepts' }
}

/** "Test the other N →": a new round on the untested concepts (at most 8 per round). */
export function TestRestLink({ lectureId, untested }: { lectureId: string; untested: number }) {
  const queryClient = useQueryClient()
  // Same URL after a rest round: drop the finished session so the page plans a new one.
  const handleClick = () =>
    void queryClient.resetQueries({ queryKey: queryKeys.diagnosticStart(lectureId, 'rest') })
  const { text, srSuffix } = restLabel(untested)
  return (
    <Button asChild variant="outline">
      <Link href={`/lectures/${lectureId}/diagnostic?round=rest` as Route} onClick={handleClick}>
        {text}
        {srSuffix && <span className="sr-only">{srSuffix}</span>}
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  )
}
