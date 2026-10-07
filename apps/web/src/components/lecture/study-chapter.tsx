'use client'

import type { BriefConcept, LectureChapter, LectureResponse } from '@lectheo/contracts'
import { ChevronDown, Play } from 'lucide-react'
import type { Route } from 'next'
import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import { formatTimestamp } from '@/client/format'
import { Button } from '@/components/ui/button'
import { ClipPlayer } from './clip-player'
import { canWatch } from './lecture-modes'
import { MarkButtons } from './mark-buttons'

/*
 * One chapter of the Study brief (Product Spec F9.10, Design System §4 "Lecture: Study"): time
 * range, title, summary, Play this chapter and the chapter marks (F11.4), a hairline, then its
 * concepts. A chapter with nothing to read is one collapsed line with ▶ Play.
 */

const MS_PER_MINUTE = 60_000
const SECTION_CLASS =
  'border-border scroll-mt-[calc(var(--topbar-height)+1rem)] border-t first:border-t-0 max-lg:scroll-mt-[calc(var(--topbar-height)+4rem)]'

export const chapterSectionId = (chapterId: string): string => `chapter-${chapterId}`

export interface StudyChapterProps {
  lecture: LectureResponse
  chapter: LectureChapter
  number: number
  /** Concepts placed in earlier chapters that this one revisits ("Also revisits: …"). */
  revisits: readonly BriefConcept[]
  /** The page's one player is this chapter's. */
  playing: boolean
  onPlay: (on: boolean) => void
  /** The chapter's concept blocks; none (and no revisits) makes it a collapsed line. */
  children?: ReactNode
}

function ChapterPlayer({
  lecture,
  chapter,
}: {
  lecture: LectureResponse
  chapter: LectureChapter
}) {
  return (
    <ClipPlayer
      lecture={lecture}
      title={`Lecture chapter: ${chapter.title}`}
      clips={[{ startMs: chapter.startMs, endMs: chapter.endMs }]}
    />
  )
}

function Revisits({ concepts }: { concepts: readonly BriefConcept[] }) {
  return (
    <p className="text-caption text-muted-foreground">
      Also revisits:{' '}
      {concepts.map((c, i) => (
        <span key={c.id}>
          {i > 0 && ', '}
          <Link
            href={`#concept-${c.id}` as Route}
            className="text-primary underline-offset-2 hover:underline"
          >
            {c.name} <span aria-hidden>→</span>
          </Link>
        </span>
      ))}
    </p>
  )
}

export function StudyChapter({
  lecture,
  chapter,
  number,
  revisits,
  playing,
  onPlay,
  children,
}: StudyChapterProps) {
  const headingId = useId()
  const playable = canWatch(lecture) && lecture.media !== null
  const range = `${formatTimestamp(chapter.startMs)}–${formatTimestamp(chapter.endMs)}`
  const minutes = Math.max(1, Math.round((chapter.endMs - chapter.startMs) / MS_PER_MINUTE))

  if (!children && revisits.length === 0) {
    return (
      <section
        id={chapterSectionId(chapter.id)}
        aria-labelledby={headingId}
        className={`${SECTION_CLASS} py-4 first:pt-0`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <details className="group min-w-0 flex-1">
            <summary className="text-body-sm flex cursor-pointer list-none items-center gap-1.5 py-1.5 [&::-webkit-details-marker]:hidden">
              <ChevronDown
                aria-hidden
                className="text-muted-foreground duration-fast size-4 shrink-0 -rotate-90 transition-transform group-open:rotate-0"
              />
              <span className="text-muted-foreground shrink-0">
                Chapter {number} · {range} ·
              </span>
              <h2 id={headingId} tabIndex={-1} className="min-w-0 font-medium outline-none">
                {chapter.title}
              </h2>
            </summary>
            <p className="text-body-sm text-muted-foreground mt-1 pl-5.5">{chapter.summary}</p>
          </details>
          {playable && (
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={playing}
              onClick={() => onPlay(!playing)}
            >
              <Play aria-hidden />
              Play<span className="sr-only">: {chapter.title}</span>
            </Button>
          )}
        </div>
        {playing && (
          <div className="mt-3">
            <ChapterPlayer lecture={lecture} chapter={chapter} />
          </div>
        )}
      </section>
    )
  }

  return (
    <section
      id={chapterSectionId(chapter.id)}
      aria-labelledby={headingId}
      className={`${SECTION_CLASS} pt-10 first:pt-0`}
    >
      <header className="space-y-2 pb-8">
        <p className="text-caption text-muted-foreground">
          Chapter {number} · {range}
        </p>
        <h2 id={headingId} tabIndex={-1} className="text-title-lg text-balance outline-none">
          {chapter.title}
        </h2>
        <p className="text-body text-muted-foreground text-pretty">{chapter.summary}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {playable && (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={playing}
              onClick={() => onPlay(!playing)}
            >
              <Play aria-hidden />
              Play this chapter
              <span className="text-muted-foreground font-normal">· {minutes} min</span>
            </Button>
          )}
          {lecture.hasTimestamps && chapter.conceptIds.length > 0 && (
            <MarkButtons
              iconOnly
              lectureId={lecture.id}
              courseId={lecture.courseId}
              name={chapter.title}
              target={{
                chapterId: chapter.id,
                tMs: chapter.startMs,
                conceptIds: chapter.conceptIds,
              }}
            />
          )}
        </div>
        {playing && (
          <div className="pt-2">
            <ChapterPlayer lecture={lecture} chapter={chapter} />
          </div>
        )}
        {revisits.length > 0 && <Revisits concepts={revisits} />}
      </header>
      {children && (
        <div className="divide-border border-border divide-y border-t pt-8 pb-2">{children}</div>
      )}
    </section>
  )
}
