'use client'

import { ArrowRight, Network } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useBuildMap } from './use-build-map'

/** Import mode, after watching: start processing (the server aligns markers afterwards). */
export function BuildMapCta({ lectureId, lost }: { lectureId: string; lost: number }) {
  const buildMap = useBuildMap()
  return (
    <Card className="border-primary/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">Done watching? Build your concept map.</p>
          <p className="text-muted-foreground text-sm">
            {lost > 0
              ? 'Your lost moments are linked to concepts once the map is ready.'
              : 'Lectheo maps the key ideas and writes a short diagnostic.'}
          </p>
        </div>
        <Button disabled={buildMap.pending} onClick={() => void buildMap.start(lectureId)}>
          <Network aria-hidden />
          {buildMap.pending ? 'Starting…' : 'Build my map'}
        </Button>
      </CardContent>
    </Card>
  )
}

/** Processing has started: no diagnostic yet, point to the progress on the lecture page. */
export function MapBuildingNote({ lectureId }: { lectureId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium">Your concept map is being built.</p>
          <p className="text-muted-foreground text-sm">
            The diagnostic opens once the questions are ready.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/lectures/${lectureId}` as Route}>
            See progress
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
