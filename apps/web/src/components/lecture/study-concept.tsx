'use client'

import type { BriefConcept, LectureResponse } from '@lectheo/contracts'
import { FileText, Play } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useId } from 'react'
import { formatTimestamp } from '@/client/format'
import { useTranscript } from '@/client/queries'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipPlayer, clipLength, type Clip } from './clip-player'
import { canWatch } from './lecture-modes'
import { MarkButtons } from './mark-buttons'
import { StudyDepth } from './study-depth'

/* One concept of the Study brief (Design System §4 "Lecture: Study", F9.2–F9.4, F9.12–F9.13). */

/** What the block shows below its buttons: nothing, its clips, or playback from a moment. */
export type OpenPart = 'clips' | number | null

/** No playable media: the clips' transcript lines instead of a player (F9.3). */
export function ClipText({ lectureId, clips }: { lectureId: string; clips: readonly Clip[] }) {
  const transcript = useTranscript(lectureId)
  if (transcript.isPending) return <Skeleton label="Loading the transcript" className="h-24" />
  const lines = (transcript.data ?? []).filter((s) =>
    clips.some((c) => s.startMs < c.endMs && s.endMs > c.startMs),
  )
  if (lines.length === 0) {
    return <p className="text-body-sm text-muted-foreground">No transcript lines for this part.</p>
  }
  return (
    <div className="bg-sunken text-body space-y-2 rounded-lg p-4">
      {lines.map((s) => (
        <p key={s.idx}>{s.text}</p>
      ))}
    </div>
  )
}

function BuildsOn({
  concept,
  courseId,
  onPage,
}: {
  concept: BriefConcept
  courseId: string
  onPage: ReadonlySet<string>
}) {
  if (concept.prerequisites.length === 0) return null
  return (
    <p className="text-caption text-muted-foreground">
      Builds on:{' '}
      {concept.prerequisites.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ', '}
          <Link
            href={(onPage.has(p.id) ? `#concept-${p.id}` : `/courses/${courseId}`) as Route}
            className="text-primary underline underline-offset-2"
          >
            {p.name}
          </Link>
        </span>
      ))}
    </p>
  )
}

export interface StudyConceptProps {
  lecture: LectureResponse
  concept: BriefConcept
  /** Concepts on this page, so "Builds on" links jump within it. */
  onPage: ReadonlySet<string>
  /** One player at a time on the page: the page owns which block is open. */
  open: OpenPart
  onOpen: (part: OpenPart) => void
  /** h3 under a chapter heading (F9.10), h2 in the flat list. */
  headingLevel?: 2 | 3
}

export function StudyConcept({
  lecture,
  concept: c,
  onPage,
  open,
  onOpen,
  headingLevel = 2,
}: StudyConceptProps) {
  const headingId = useId()
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  const playable = canWatch(lecture) && lecture.media !== null
  const firstMoment = c.clips[0]?.startMs
  /** A cited moment plays in this block when it is in this lecture; else it links out. */
  const seekable = (lectureId: string) =>
    playable && lectureId === lecture.id ? (ms: number) => onOpen(ms) : undefined

  return (
    <article
      id={`concept-${c.id}`}
      aria-labelledby={headingId}
      className="scroll-mt-[calc(var(--topbar-height)+1rem)] space-y-4 py-8 first:pt-0 max-lg:scroll-mt-[calc(var(--topbar-height)+4rem)]"
    >
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Heading id={headingId} tabIndex={-1} className="text-title-md outline-none">
            {c.name}
          </Heading>
          <MasteryBadge
            size="sm"
            state={c.mastery.state}
            confidentMistake={c.mastery.confidentMistake}
          />
        </div>
        <BuildsOn concept={c} courseId={lecture.courseId} onPage={onPage} />
      </header>

      <p className="text-body-lg text-pretty">{c.summary}</p>

      {c.keyPoints.length > 0 && (
        <ul className="marker:text-muted-foreground text-body list-disc space-y-2 pl-5">
          {c.keyPoints.map((k) => {
            const source = k.sources[0]
            return (
              <li key={k.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-pretty">{k.text}</span>
                  {source && lecture.hasTimestamps && (
                    <SourceRef
                      compact
                      quiet
                      source={source}
                      onSeek={seekable(source.lectureId)}
                      className="shrink-0"
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {c.clips.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open === 'clips'}
            onClick={() => onOpen(open === 'clips' ? null : 'clips')}
          >
            {playable ? <Play aria-hidden /> : <FileText aria-hidden />}
            {playable && firstMoment !== undefined
              ? `Watch from ${formatTimestamp(firstMoment)}`
              : 'Read this part'}
            {playable && c.clipMs > 0 && (
              <span className="text-muted-foreground font-normal">· {clipLength(c.clipMs)}</span>
            )}
          </Button>
        )}
        {lecture.hasTimestamps && firstMoment !== undefined && (
          <MarkButtons
            lectureId={lecture.id}
            courseId={lecture.courseId}
            target={{ conceptId: c.id, tMs: firstMoment }}
            name={c.name}
          />
        )}
      </div>

      {open !== null &&
        (playable ? (
          <ClipPlayer
            key={String(open)}
            lecture={lecture}
            title={`Lecture clip: ${c.name}`}
            clips={open === 'clips' ? c.clips : null}
            startMs={open === 'clips' ? undefined : open}
          />
        ) : (
          <ClipText lectureId={lecture.id} clips={c.clips} />
        ))}

      {c.depth && (
        <StudyDepth
          depth={c.depth}
          courseId={lecture.courseId}
          onPage={onPage}
          seekable={seekable}
        />
      )}
    </article>
  )
}
