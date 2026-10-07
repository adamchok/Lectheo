'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LocalPlayer } from '@/client/capture/local-player'
import { WatchPlayer, type WatchPlayerHandle } from '@/client/capture/watch-player'
import { formatTimestamp } from '@/client/format'

/* The Study brief's inline mini player (F9.3): plays a concept's clips, or from one moment. */

export interface Clip {
  startMs: number
  endMs: number
}

/** How often playback is checked against the clip ends. */
const TICK_MS = 250
/** Before a clip's start by more than this, the player is between clips and jumps ahead. */
const GAP_SLACK_MS = 1_000
/** A move this large between two ticks is the student seeking, not playback. */
const JUMP_MS = 2_000
const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60

const NO_MEDIA: NonNullable<LectureResponse['media']> = { youtubeId: null, durationMs: null }

/** 90 000 → "1 min 30 s", 45 000 → "45 s", 120 000 → "2 min". */
export function clipLength(ms: number): string {
  const total = Math.max(1, Math.round(ms / MS_PER_SECOND))
  const minutes = Math.floor(total / SECONDS_PER_MINUTE)
  const seconds = total % SECONDS_PER_MINUTE
  return [minutes > 0 ? `${minutes} min` : '', seconds > 0 ? `${seconds} s` : '']
    .filter(Boolean)
    .join(' ')
}

/** "Plays 3 clips · 2 min 10 s, skipping the parts in between" / "Plays from 1:45:15". */
function caption(clips: readonly Clip[] | null, from: number): string {
  if (!clips || clips.length === 0) return `Plays from ${formatTimestamp(from)}.`
  const total = clipLength(clips.reduce((sum, c) => sum + Math.max(0, c.endMs - c.startMs), 0))
  return clips.length === 1
    ? `Plays 1 clip · ${total}.`
    : `Plays ${clips.length} clips · ${total}, skipping the parts in between.`
}

export interface ClipPlayerProps {
  lecture: LectureResponse
  /** Played in order, skipping the gaps and stopping after the last; null plays freely. */
  clips: readonly Clip[] | null
  /** Where to start (default: the first clip). */
  startMs?: number
  /** The embed's accessible name, e.g. "Lecture clip: Hash tables". */
  title: string
}

/**
 * Watch mode's players (YouTube with the MP3 fallback, or the student's own file) inside the
 * block. Starts playing once ready: the student just asked for it. Skipping and stopping end as
 * soon as the student seeks or the last clip ends, so the player never fights them.
 */
export function ClipPlayer({ lecture, clips, startMs, title }: ClipPlayerProps) {
  const handle = useRef<WatchPlayerHandle | null>(null)
  const [playing, setPlaying] = useState(false)
  const [status, setStatus] = useState('')
  const enforcing = useRef(Boolean(clips && clips.length > 0))
  const lastMs = useRef<number | null>(null)
  const from = startMs ?? clips?.[0]?.startMs ?? lecture.media?.startMs ?? 0

  const onReady = useCallback(
    (h: WatchPlayerHandle | null) => {
      handle.current = h
      if (!h) return
      lastMs.current = from
      h.seek(from)
    },
    [from],
  )
  const onEnded = useCallback(() => setPlaying(false), [])

  useEffect(() => {
    if (!playing || !clips || clips.length === 0) return
    const timer = window.setInterval(() => {
      const h = handle.current
      if (!h || !enforcing.current) return
      const now = h.currentMs()
      const prev = lastMs.current
      lastMs.current = now
      if (prev !== null && Math.abs(now - prev) > JUMP_MS) {
        enforcing.current = false
        return
      }
      const index = clips.findIndex((c) => now < c.endMs)
      const clip = clips[index]
      if (!clip) {
        h.pause()
        enforcing.current = false
        setStatus('End of this part.')
      } else if (now < clip.startMs - GAP_SLACK_MS) {
        h.seek(clip.startMs)
        lastMs.current = clip.startMs
        setStatus(`Skipped to clip ${index + 1} of ${clips.length}.`)
      }
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing, clips])

  const media = { ...(lecture.media ?? NO_MEDIA), startMs: from }
  return (
    <div className="space-y-2">
      {lecture.source === 'import' ? (
        <LocalPlayer
          lectureId={lecture.id}
          media={media}
          onReady={onReady}
          onPlayingChange={setPlaying}
          onEnded={onEnded}
        />
      ) : (
        <WatchPlayer
          media={media}
          title={title}
          onReady={onReady}
          onPlayingChange={setPlaying}
          onEnded={onEnded}
        />
      )}
      <p className="text-caption text-muted-foreground">{caption(clips, from)}</p>
      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  )
}
