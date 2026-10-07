'use client'

import type { BriefConcept, LectureResponse } from '@lectheo/contracts'
import { FileText, Play } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useId } from 'react'
import { formatTimestamp, formatTimestampLong } from '@/client/format'
import { useTranscript } from '@/client/queries'
import { MasteryBadge } from '@/components/mastery-badge'
import { SourceRef } from '@/components/source-ref'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClipPlayer, clipLength, type Clip } from './clip-player'
import { canWatch } from './lecture-modes'
import { MarkButtons } from './mark-buttons'

/* One concept of the Study brief (Design System §4 "Lecture: Study", F9.2–F9.4, F11.5). */

/** What the block shows below its buttons: nothing, its clips, or playback from a key point. */
export type OpenPart = 'clips' | number | null

/** No playable media: the clips' transcript lines instead of a player (F9.3). */
function ClipText({ lectureId, clips }: { lectureId: string; clips: readonly Clip[] }) {
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

/** "In chapter 4 · 23:10": the watch page where there is media, else the transcript. */
function ChapterLink({
  lecture,
  chapter,
  number,
}: {
  lecture: LectureResponse
  chapter: NonNullable<BriefConcept['chapter']>
  number: number
}) {
  const watch = canWatch(lecture)
  const href = watch
    ? `/lectures/${lecture.id}/watch?t=${chapter.startMs}`
    : `/lectures/${lecture.id}?view=transcript&t=${chapter.startMs}#transcript`
  return (
    <p className="text-caption">
      <Link href={href as Route} className="text-primary underline-offset-2 hover:underline">
        <span aria-hidden>
          In chapter {number} · {formatTimestamp(chapter.startMs)}
        </span>
        <span className="sr-only">
          In chapter {number}, {chapter.title}. {watch ? 'Watch' : 'Read the transcript'} from{' '}
          {formatTimestampLong(chapter.startMs)}
        </span>
      </Link>
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
}

export function StudyConcept({ lecture, concept: c, onPage, open, onOpen }: StudyConceptProps) {
  const headingId = useId()
  const playable = canWatch(lecture) && lecture.media !== null
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
                    onSeek={here ? (ms) => onOpen(ms) : undefined}
                  />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {c.chapter && chapterNo > 0 && (
        <ChapterLink lecture={lecture} chapter={c.chapter} number={chapterNo} />
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
            {playable ? 'Watch this part' : 'Read this part'}
            {playable && firstMoment !== undefined && (
              <span className="text-muted-foreground font-normal">
                · from {formatTimestamp(firstMoment)}
                {c.clipMs > 0 && ` · ${clipLength(c.clipMs)}`}
              </span>
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
    </article>
  )
}
