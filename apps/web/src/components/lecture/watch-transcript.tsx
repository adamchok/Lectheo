'use client'

import type { LectureChapter, TranscriptSegmentDto } from '@lectheo/contracts'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { z } from 'zod'
import { formatTimestamp } from '@/client/format'
import { useTranscript } from '@/client/queries'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ChaptersList } from './chapters-list'

type Segment = z.infer<typeof TranscriptSegmentDto>

/** How often the transcript highlight follows the playing video. */
const TICK_MS = 500
/** After the student scrolls the transcript, it stops following the video for this long. */
const FOLLOW_PAUSE_MS = 5_000

export interface TranscriptPanelProps {
  lectureId: string
  courseId: string
  /** F11.3: with chapters, the panel has Transcript | Chapters tabs. */
  chapters: readonly LectureChapter[]
  startMs: number
  playing: boolean
  /** Player time, or null while no player is ready. */
  currentMs: () => number | null
  onSeek: ((ms: number) => void) | null
}

/** Owns the playback tick, so only the transcript re-renders while the video plays. */
export function TranscriptPanel({
  lectureId,
  courseId,
  chapters,
  startMs,
  playing,
  currentMs,
  onSeek,
}: TranscriptPanelProps) {
  const transcript = useTranscript(lectureId)
  const list = useRef<HTMLOListElement>(null)
  const [nowMs, setNowMs] = useState(startMs)
  const userScrolledAt = useRef(Number.NEGATIVE_INFINITY)
  const activeIdx = transcript.data?.find((s) => s.startMs <= nowMs && nowMs < s.endMs)?.idx

  useEffect(() => {
    const sync = () => {
      const ms = currentMs()
      if (ms !== null) setNowMs(ms)
    }
    // Once on play/pause too, so the highlight lands where playback stopped.
    const first = window.setTimeout(sync, 0)
    const timer = playing ? window.setInterval(sync, TICK_MS) : undefined
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [playing, currentMs])

  useEffect(() => {
    const el = list.current
    const item = el?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    if (!el || !item) return
    // Reading back a few lines shouldn't be yanked away by the next tick.
    if (performance.now() - userScrolledAt.current < FOLLOW_PAUSE_MS) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ top: item.offsetTop - el.clientHeight / 3, behavior: reduce ? 'auto' : 'smooth' })
  }, [activeIdx])

  const markUserScroll = useCallback(() => {
    userScrolledAt.current = performance.now()
  }, [])
  const seek = useCallback(
    (ms: number) => {
      onSeek?.(ms)
      setNowMs(ms)
    },
    [onSeek],
  )

  const body = transcript.isPending ? (
    <Skeleton label="Loading the transcript" className="space-y-3 p-4">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </Skeleton>
  ) : transcript.isError ? (
    <p className="text-muted-foreground p-4 text-sm">
      Couldn&apos;t load the transcript.{' '}
      <button type="button" className="underline" onClick={() => transcript.refetch()}>
        Retry
      </button>
    </p>
  ) : transcript.data.length === 0 ? (
    <p className="text-muted-foreground p-4 text-sm">No transcript for this lecture yet.</p>
  ) : (
    <ol
      ref={list}
      onWheel={markUserScroll}
      onTouchMove={markUserScroll}
      className="relative min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
    >
      {transcript.data.map((segment) => (
        <TranscriptRow
          key={segment.idx}
          segment={segment}
          active={segment.idx === activeIdx}
          onSeek={onSeek ? seek : null}
        />
      ))}
    </ol>
  )
  const hasChapters = chapters.length > 0

  return (
    <section
      aria-label={hasChapters ? 'Transcript and chapters' : 'Transcript'}
      className="bg-card flex max-h-[28rem] min-h-0 min-w-0 flex-col rounded-xl border lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:max-h-[calc(100dvh-var(--topbar-height)-2rem)]"
    >
      {hasChapters ? (
        <Tabs defaultValue="transcript" className="min-h-0 flex-1 gap-0">
          <h2 className="sr-only">Transcript and chapters</h2>
          <div className="border-b px-3 py-2">
            <TabsList>
              <TabsTrigger value="transcript" className="px-3">
                Transcript
              </TabsTrigger>
              <TabsTrigger value="chapters" className="px-3">
                Chapters
              </TabsTrigger>
            </TabsList>
          </div>
          {/* Kept mounted, so the transcript keeps its scroll and follow state across tabs. */}
          <TabsContent
            value="transcript"
            forceMount
            className="flex min-h-0 flex-col data-[state=inactive]:hidden"
          >
            {body}
          </TabsContent>
          <TabsContent value="chapters" className="flex min-h-0 flex-col">
            <ChaptersList
              lectureId={lectureId}
              courseId={courseId}
              chapters={chapters}
              nowMs={nowMs}
              onSeek={onSeek ? seek : null}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <>
          <h2 className="text-heading border-b px-4 py-3">Transcript</h2>
          {body}
        </>
      )}
    </section>
  )
}

const TranscriptRow = memo(function TranscriptRow({
  segment,
  active,
  onSeek,
}: {
  segment: Segment
  active: boolean
  onSeek: ((ms: number) => void) | null
}) {
  return (
    <li data-idx={segment.idx}>
      <button
        type="button"
        disabled={!onSeek}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSeek?.(segment.startMs)}
        className={cn(
          'enabled:hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm break-words transition-colors',
          active ? 'bg-accent text-foreground' : 'text-muted-foreground',
        )}
      >
        <span className="text-primary mr-2 font-mono text-xs tabular-nums">
          {formatTimestamp(segment.startMs)}
        </span>
        {segment.text}
      </button>
    </li>
  )
})
