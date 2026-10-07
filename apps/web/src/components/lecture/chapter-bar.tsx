'use client'

import type { LectureChapter, LectureResponse } from '@lectheo/contracts'
import { useEffect, useRef, useState } from 'react'
import { Toggle } from '@/components/ui/toggle'

/*
 * Watch mode under the player (F11.3): the lecture's progress with a 2px tick at each chapter
 * start, the current chapter, and "Play this chapter only", which pauses at the chapter's end.
 */

const TICK_MS = 250
/** A playhead this far past the chapter's end was moved there (a seek), not played into. */
const JUMP_MS = 2_000

export const chapterAt = (
  chapters: readonly LectureChapter[],
  ms: number,
): LectureChapter | undefined => chapters.findLast((c) => c.startMs <= ms) ?? chapters[0]

export interface ChapterBarProps {
  lecture: LectureResponse
  playing: boolean
  /** Player time, or null while no player is ready. */
  currentMs: () => number | null
  pause: () => void
}

export function ChapterBar({ lecture, playing, currentMs, pause }: ChapterBarProps) {
  const chapters = lecture.chapters
  const [nowMs, setNowMs] = useState(lecture.media?.startMs ?? chapters[0]?.startMs ?? 0)
  const [only, setOnly] = useState(false)
  const [status, setStatus] = useState('')
  /** The chapter "only" holds to; null re-locks to wherever playback is next. */
  const locked = useRef<LectureChapter | null>(null)

  useEffect(() => {
    const sync = () => {
      const ms = currentMs()
      if (ms === null) return
      setNowMs(ms)
      if (!only) return
      const lock = locked.current
      if (!lock || ms < lock.startMs || ms >= lock.endMs + JUMP_MS) {
        locked.current = chapterAt(chapters, ms) ?? null
      } else if (ms >= lock.endMs) {
        pause()
        setStatus(`Paused at the end of chapter ${chapters.indexOf(lock) + 1}, ${lock.title}.`)
        locked.current = null
      }
    }
    const first = window.setTimeout(sync, 0)
    const timer = playing ? window.setInterval(sync, TICK_MS) : undefined
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [playing, currentMs, pause, only, chapters])

  if (chapters.length === 0) return null
  const start = lecture.media?.startMs ?? chapters[0]?.startMs ?? 0
  const end = lecture.media?.endMs ?? chapters.at(-1)?.endMs ?? start
  const span = Math.max(1, end - start)
  const pct = (ms: number) => `${Math.min(100, Math.max(0, ((ms - start) / span) * 100))}%`
  const current = chapterAt(chapters, nowMs)
  const number = current ? chapters.indexOf(current) + 1 : 0

  return (
    <div className="space-y-2">
      <div aria-hidden className="bg-muted relative h-1.5 overflow-hidden rounded-full">
        <div className="bg-primary/70 absolute inset-y-0 left-0" style={{ width: pct(nowMs) }} />
        {chapters.slice(1).map((c) => (
          <div
            key={c.id}
            className="bg-muted-foreground absolute inset-y-0 w-0.5"
            style={{ left: pct(c.startMs) }}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-muted-foreground min-w-0 truncate">
          {current && `Chapter ${number} of ${chapters.length} · ${current.title}`}
        </p>
        <Toggle
          variant="outline"
          size="sm"
          pressed={only}
          onPressedChange={(on) => {
            locked.current = null
            setStatus('')
            setOnly(on)
          }}
          className="px-2.5"
        >
          Play this chapter only
        </Toggle>
      </div>
      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  )
}
