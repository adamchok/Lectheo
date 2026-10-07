'use client'

import type { LectureResponse } from '@lectheo/contracts'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LocalPlayer } from '@/client/capture/local-player'
import { WatchPlayer, type WatchPlayerHandle } from '@/client/capture/watch-player'

/* The Study brief's inline mini player (F9.3): plays a concept's clips, or from one moment. */

export interface Clip {
  startMs: number
  endMs: number
}

/** How often playback is checked against the clip ends. */
const TICK_MS = 250
/** Before a clip's start by more than this, the player is between clips and jumps ahead. */
const GAP_SLACK_MS = 1_000

const NO_MEDIA: NonNullable<LectureResponse['media']> = { youtubeId: null, durationMs: null }

export interface ClipPlayerProps {
  lecture: LectureResponse
  /** Played in order, skipping the gaps and stopping after the last; null plays freely. */
  clips: readonly Clip[] | null
  /** Where to start (default: the first clip). */
  startMs?: number
}

/** The clip that the playhead is in or before, or undefined once past the last one. */
const nextClip = (clips: readonly Clip[], ms: number): Clip | undefined =>
  clips.find((c) => ms < c.endMs)

/**
 * Watch mode's players (YouTube with the MP3 fallback, or the student's own file) inside the
 * block. Starts playing once ready: the student just asked for it.
 */
export function ClipPlayer({ lecture, clips, startMs }: ClipPlayerProps) {
  const handle = useRef<WatchPlayerHandle | null>(null)
  const [playing, setPlaying] = useState(false)
  const from = startMs ?? clips?.[0]?.startMs ?? lecture.media?.startMs ?? 0

  const onReady = useCallback(
    (h: WatchPlayerHandle | null) => {
      handle.current = h
      h?.seek(from)
    },
    [from],
  )
  const onEnded = useCallback(() => setPlaying(false), [])

  useEffect(() => {
    if (!playing || !clips || clips.length === 0) return
    const timer = window.setInterval(() => {
      const h = handle.current
      if (!h) return
      const now = h.currentMs()
      const clip = nextClip(clips, now)
      if (!clip) h.pause()
      else if (now < clip.startMs - GAP_SLACK_MS) h.seek(clip.startMs)
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing, clips])

  const media = { ...(lecture.media ?? NO_MEDIA), startMs: from }
  return lecture.source === 'import' ? (
    <LocalPlayer
      lectureId={lecture.id}
      media={media}
      onReady={onReady}
      onPlayingChange={setPlaying}
      onEnded={onEnded}
    />
  ) : (
    <WatchPlayer media={media} onReady={onReady} onPlayingChange={setPlaying} onEnded={onEnded} />
  )
}
