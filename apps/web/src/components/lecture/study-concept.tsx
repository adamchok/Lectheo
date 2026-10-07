'use client'

import type { BriefConcept, LectureResponse } from '@lectheo/contracts'
import { FileText, Play } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useId, useState } from 'react'
import { formatTimestamp } from '@/client/format'
import { useTranscript } from '@/client/queries'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipPlayer, type Clip } from './clip-player'
import { canWatch } from './lecture-modes'
import { MarkButtons } from './mark-buttons'

/* One concept of the Study brief (Design System §4 "Lecture: Study", F9.2–F9.4, F11.5). */

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

/** 90 000 → "1 min 30 s", 45 000 → "45 s", 120 000 → "2 min". */
export function clipLength(ms: number): string {
  const total = Math.max(1, Math.round(ms / MS_PER_SECOND))
  const minutes = Math.floor(total / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE
  return [minutes > 0 ? `${minutes} min` : '', seconds > 0 ? `${seconds} s` : '']
    .filter(Boolean)
    .join(' ')
}

/** No playable media: the clips' transcript lines instead of a player (F9.3). */
function ClipText({ lectureId, clips }: { lectureId: string; clips: readonly Clip[] }) {
  const transcript = useTranscript(lectureId)
  if (transcript.isPending) return <Skeleton label="Loading the transcript" className="h-24" />
  const lines = (transcript.data ?? []).filter((s) =>
    clips.some((c) => s.startMs < c.endMs && s.endMs > c.startMs),
  )
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
            className="text-primary underline-offset-2 hover:underline"
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
}

export function StudyConcept({ lecture, concept: c, onPage }: StudyConceptProps) {
  const headingId = useId()
  const playable = canWatch(lecture) && lecture.media !== null
  // null: closed; 'clips': Watch this part; a number: playing from a key point's moment.
  const [open, setOpen] = useState<'clips' | number | null>(null)
  const chapterNo = c.chapter ? lecture.chapters.findIndex((ch) => ch.id === c.chapter?.id) + 1 : 0
  const firstMoment = c.clips[0]?.startMs

  return (
    <article
      id={`concept-${c.id}`}
      aria-labelledby={headingId}
      className="scroll-mt-[calc(var(--topbar-height)+1rem)] space-y-4 py-8 first:pt-0"
    >
      <header className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h2 id={headingId} tabIndex={-1} className="text-title-md outline-none">
            {c.name}
          </h2>
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
            const here = playable && source?.lectureId === lecture.id
            return (
              <li key={k.id} className="text-pretty">
                {k.text}{' '}
                {source && lecture.hasTimestamps && (
                  <SourceRef
                    compact
                    source={source}
                    onSeek={here ? (ms) => setOpen(ms) : undefined}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {c.chapter && chapterNo > 0 && (
        <p className="text-caption">
          <Link
            href={`/lectures/${lecture.id}/watch?t=${c.chapter.startMs}` as Route}
            className="text-primary underline-offset-2 hover:underline"
          >
            In chapter {chapterNo} · {formatTimestamp(c.chapter.startMs)}
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {c.clips.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            aria-expanded={open === 'clips'}
            onClick={() => setOpen(open === 'clips' ? null : 'clips')}
          >
            {playable ? <Play aria-hidden /> : <FileText aria-hidden />}
            {playable ? 'Watch this part' : 'Read this part'}
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
            clips={open === 'clips' ? c.clips : null}
            startMs={open === 'clips' ? undefined : open}
          />
        ) : (
          <ClipText lectureId={lecture.id} clips={c.clips} />
        ))}
    </article>
  )
}
