'use client'

import type { LectureChapter } from '@lectheo/contracts'
import { formatTimestamp, formatTimestampLong } from '@/client/format'
import { cn } from '@/lib/utils'
import { chapterAt } from './chapter-bar'
import { MarkButtons } from './mark-buttons'

/*
 * The watch page's Chapters tab (F11.3, F11.4, Design System §4 "Lecture and watch"): time, title
 * and description per chapter; the playing one on `accent` with a `primary` bar; quiet marks on
 * chapters that teach concepts.
 */

export interface ChaptersListProps {
  lectureId: string
  courseId: string
  chapters: readonly LectureChapter[]
  nowMs: number
  onSeek: ((ms: number) => void) | null
}

export function ChaptersList({ lectureId, courseId, chapters, nowMs, onSeek }: ChaptersListProps) {
  const current = chapterAt(chapters, nowMs)
  return (
    <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {chapters.map((c) => {
        const active = c.id === current?.id
        return (
          <li
            key={c.id}
            className={cn(
              'relative flex items-start gap-1 rounded-md transition-colors',
              active && 'bg-accent',
            )}
          >
            {active && (
              <span
                aria-hidden
                className="bg-primary absolute inset-y-1 left-0 w-0.5 rounded-full"
              />
            )}
            <button
              type="button"
              disabled={!onSeek}
              aria-current={active ? 'true' : undefined}
              aria-describedby={`chapter-${c.id}-summary`}
              onClick={() => onSeek?.(c.startMs)}
              className="enabled:hover:bg-accent min-w-0 flex-1 space-y-0.5 rounded-md px-3 py-2 text-left transition-colors"
            >
              <span className="text-mono-sm text-primary block">
                <span aria-hidden>{formatTimestamp(c.startMs)}</span>
                <span className="sr-only">{formatTimestampLong(c.startMs)}</span>
              </span>
              <span className="text-heading block break-words">{c.title}</span>
              {/* Shown inside the button but read as its description, not its name. */}
              <span
                id={`chapter-${c.id}-summary`}
                aria-hidden
                className="text-body-sm text-muted-foreground block break-words"
              >
                {c.summary}
              </span>
            </button>
            {c.conceptIds.length > 0 && (
              <div className="shrink-0 py-1.5 pr-1">
                <MarkButtons
                  iconOnly
                  lectureId={lectureId}
                  courseId={courseId}
                  name={c.title}
                  target={{ chapterId: c.id, tMs: c.startMs, conceptIds: c.conceptIds }}
                />
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
